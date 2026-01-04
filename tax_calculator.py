from datetime import datetime, timedelta
from collections import defaultdict
from config import Config

def validate_no_oversell(transactions):
    """
    Validate that across all transactions (chronological order) no stock is ever sold
    into a negative position.

    Returns:
        (ok: bool, error_message: Optional[str])
    """
    # Sort transactions defensively (models already returns date ASC, created_at ASC)
    def sort_key(tx):
        d = tx.get('date')
        try:
            dt = datetime.strptime(d, '%Y-%m-%d')
        except Exception:
            dt = datetime.min
        created_at = tx.get('created_at') or ''
        return (dt, created_at)

    qty_by_stock = defaultdict(int)
    for tx in sorted(transactions, key=sort_key):
        stock_name = tx.get('stock_name')
        if not stock_name:
            continue
        tx_type = tx.get('type')
        quantity = int(tx.get('quantity') or 0)
        if tx_type == 'buy':
            qty_by_stock[stock_name] += quantity
        elif tx_type == 'sell':
            qty_by_stock[stock_name] -= quantity
            if qty_by_stock[stock_name] < 0:
                return False, "Nelze prodat více kusů než je aktuálně drženo z důvodu zaručení správného výpočtu daňových informací."

    return True, None

def calculate_holdings(transactions):
    """
    Apply FIFO to determine current holdings.
    Returns a list of holdings with purchase date, price (including fees), and remaining quantity.
    """
    holdings = defaultdict(list)  # stock_name -> list of (date, price, quantity)
    
    for tx in transactions:
        stock_name = tx['stock_name']
        tx_type = tx['type']
        tx_date = datetime.strptime(tx['date'], '%Y-%m-%d').date()
        tx_price = tx['price']
        tx_quantity = tx['quantity']
        tx_fees = tx.get('fees', 0.0) or 0.0  # Handle None or missing fees
        
        if tx_type == 'buy':
            # Calculate effective price per share including fees
            # Cost basis = (price * quantity) + fees
            # Effective price per share = cost_basis / quantity
            cost_basis = (tx_price * tx_quantity) + tx_fees
            effective_price = cost_basis / tx_quantity if tx_quantity > 0 else tx_price
            
            # Add purchase to holdings with effective price (including fees)
            holdings[stock_name].append({
                'date': tx_date,
                'price': effective_price,
                'quantity': tx_quantity
            })
        elif tx_type == 'sell':
            # Remove from holdings using FIFO (oldest first)
            remaining_to_sell = tx_quantity
            stock_holdings = holdings[stock_name]
            
            # Sort by date to ensure FIFO
            stock_holdings.sort(key=lambda x: x['date'])
            
            i = 0
            while remaining_to_sell > 0 and i < len(stock_holdings):
                if stock_holdings[i]['quantity'] <= remaining_to_sell:
                    # This purchase is fully sold
                    remaining_to_sell -= stock_holdings[i]['quantity']
                    stock_holdings.pop(i)
                else:
                    # Partial sale of this purchase
                    stock_holdings[i]['quantity'] -= remaining_to_sell
                    remaining_to_sell = 0
                i += 1
    
    # Convert to list format for easier processing
    result = []
    for stock_name, stock_holdings in holdings.items():
        for holding in stock_holdings:
            result.append({
                'stock_name': stock_name,
                'purchase_date': holding['date'],
                'purchase_price': holding['price'],
                'quantity': holding['quantity']
            })
    
    return result

def get_three_year_holdings(holdings, current_date=None):
    """
    Filter stocks held for more than 3 years.
    Returns holdings with quantity held >3 years.
    """
    if current_date is None:
        current_date = datetime.now().date()
    
    three_year_date = current_date - timedelta(days=Config.THREE_YEAR_EXEMPTION_DAYS)
    
    three_year_holdings = []
    for holding in holdings:
        purchase_date = holding['purchase_date']
        if isinstance(purchase_date, str):
            purchase_date = datetime.strptime(purchase_date, '%Y-%m-%d').date()
        
        if purchase_date <= three_year_date:
            three_year_holdings.append(holding)
    
    # Aggregate by stock name
    aggregated = defaultdict(lambda: {'quantity': 0, 'total_value': 0})
    for holding in three_year_holdings:
        stock_name = holding['stock_name']
        aggregated[stock_name]['quantity'] += holding['quantity']
        aggregated[stock_name]['total_value'] += holding['quantity'] * holding['purchase_price']
    
    return dict(aggregated)

def calculate_current_year_sales(transactions, current_year=None):
    """
    Sum sell transaction values in the current tax year (net of fees).
    EXCLUDES sales of stocks held >3 years (they are tax-free regardless of amount).
    Tax year is January 1 to December 31.
    For sell transactions: revenue = (price * quantity) - fees
    """
    if current_year is None:
        current_year = datetime.now().year
    
    year_start = datetime(current_year, 1, 1).date()
    year_end = datetime(current_year, 12, 31).date()
    three_year_date = datetime.now().date() - timedelta(days=Config.THREE_YEAR_EXEMPTION_DAYS)
    
    # Calculate holdings before each sale to determine if stock was held >3 years
    # Process transactions chronologically to track holdings
    holdings = {}  # stock_name -> list of (date, quantity) sorted by date
    
    total_sales = 0
    
    # Sort transactions by date
    sorted_transactions = sorted(transactions, key=lambda x: datetime.strptime(x['date'], '%Y-%m-%d'))
    
    for tx in sorted_transactions:
        stock_name = tx['stock_name']
        tx_date = datetime.strptime(tx['date'], '%Y-%m-%d').date()
        
        if tx['type'] == 'buy':
            # Add purchase to holdings
            if stock_name not in holdings:
                holdings[stock_name] = []
            holdings[stock_name].append({
                'date': tx_date,
                'quantity': tx['quantity']
            })
            # Sort by date (FIFO)
            holdings[stock_name].sort(key=lambda x: x['date'])
            
        elif tx['type'] == 'sell':
            # Apply FIFO to determine which purchases were sold
            remaining_to_sell = tx['quantity']
            stock_holdings = holdings.get(stock_name, [])
            
            # Track how many shares were held <3 years (to count only that portion)
            shares_held_less_than_3_years = 0
            
            i = 0
            while remaining_to_sell > 0 and i < len(stock_holdings):
                holding = stock_holdings[i]
                purchase_date = holding['date']
                
                # Only consider holdings purchased before or on sale date
                if purchase_date <= tx_date:
                    # Check if this purchase was held <3 years at time of sale
                    days_held = (tx_date - purchase_date).days
                    
                    # Calculate how many shares from this purchase are being sold
                    shares_from_this_purchase = min(holding['quantity'], remaining_to_sell)
                    
                    if days_held <= Config.THREE_YEAR_EXEMPTION_DAYS:
                        # This portion was held <3 years, count it
                        shares_held_less_than_3_years += shares_from_this_purchase
                    
                    if holding['quantity'] <= remaining_to_sell:
                        # This purchase is fully sold
                        remaining_to_sell -= holding['quantity']
                        stock_holdings.pop(i)
                        # Don't increment i because next element moved to current position
                    else:
                        # Partial sale of this purchase
                        holding['quantity'] -= remaining_to_sell
                        remaining_to_sell = 0
                        i += 1
                else:
                    # Skip holdings purchased after sale date
                    i += 1
            
            # Update holdings dictionary
            holdings[stock_name] = stock_holdings
            
            # Check if this sale is in current tax year
            if year_start <= tx_date <= year_end:
                # Only count the portion of sales that were held <3 years
                if shares_held_less_than_3_years > 0:
                    tx_fees = tx.get('fees', 0.0) or 0.0
                    total_shares_sold = tx['quantity']
                    # Calculate total net sale value (revenue - fees)
                    total_net_sale_value = (tx['price'] * total_shares_sold) - tx_fees
                    # Calculate proportional value: only count the portion held <3 years
                    proportional_value = (shares_held_less_than_3_years / total_shares_sold) * total_net_sale_value
                    total_sales += proportional_value
                # Note: If shares_held_less_than_3_years is 0, all sold stocks were held >3 years
                # and should not count against the 100k limit
    
    return total_sales

def calculate_current_year_sales_three_years(transactions, current_year=None):
    """
    Sum sell transaction values in the current tax year for stocks held >3 years (net of fees).
    These sales are always tax-free and don't count against the 100k limit.
    Tax year is January 1 to December 31.
    For sell transactions: revenue = (price * quantity) - fees
    """
    if current_year is None:
        current_year = datetime.now().year
    
    year_start = datetime(current_year, 1, 1).date()
    year_end = datetime(current_year, 12, 31).date()
    three_year_date = datetime.now().date() - timedelta(days=Config.THREE_YEAR_EXEMPTION_DAYS)
    
    # Calculate holdings before each sale to determine if stock was held >3 years
    # Process transactions chronologically to track holdings
    holdings = {}  # stock_name -> list of (date, quantity) sorted by date
    
    total_sales = 0
    
    # Sort transactions by date
    sorted_transactions = sorted(transactions, key=lambda x: datetime.strptime(x['date'], '%Y-%m-%d'))
    
    for tx in sorted_transactions:
        stock_name = tx['stock_name']
        tx_date = datetime.strptime(tx['date'], '%Y-%m-%d').date()
        
        if tx['type'] == 'buy':
            # Add purchase to holdings
            if stock_name not in holdings:
                holdings[stock_name] = []
            holdings[stock_name].append({
                'date': tx_date,
                'quantity': tx['quantity']
            })
            # Sort by date (FIFO)
            holdings[stock_name].sort(key=lambda x: x['date'])
            
        elif tx['type'] == 'sell':
            # Apply FIFO to determine which purchases were sold
            remaining_to_sell = tx['quantity']
            stock_holdings = holdings.get(stock_name, [])
            
            # Track how many shares were held >3 years (to count only that portion)
            shares_held_more_than_3_years = 0
            
            i = 0
            while remaining_to_sell > 0 and i < len(stock_holdings):
                holding = stock_holdings[i]
                purchase_date = holding['date']
                
                # Only consider holdings purchased before or on sale date
                if purchase_date <= tx_date:
                    # Check if this purchase was held >3 years at time of sale
                    # Calculate the date 3 years before the sale date
                    three_year_before_sale = tx_date - timedelta(days=Config.THREE_YEAR_EXEMPTION_DAYS)
                    days_held = (tx_date - purchase_date).days
                    
                    # Calculate how many shares from this purchase are being sold
                    shares_from_this_purchase = min(holding['quantity'], remaining_to_sell)
                    
                    # Check if purchase was made before the 3-year cutoff date
                    if purchase_date <= three_year_before_sale:
                        # This portion was held >3 years, count it
                        shares_held_more_than_3_years += shares_from_this_purchase
                    
                    if holding['quantity'] <= remaining_to_sell:
                        # This purchase is fully sold
                        remaining_to_sell -= holding['quantity']
                        stock_holdings.pop(i)
                        # Don't increment i because next element moved to current position
                    else:
                        # Partial sale of this purchase
                        holding['quantity'] -= remaining_to_sell
                        remaining_to_sell = 0
                        i += 1
                else:
                    # Skip holdings purchased after sale date
                    i += 1
            
            # Update holdings dictionary
            holdings[stock_name] = stock_holdings
            
            # Check if this sale is in current tax year
            if year_start <= tx_date <= year_end:
                # Only count the portion of sales that were held >3 years
                if shares_held_more_than_3_years > 0:
                    tx_fees = tx.get('fees', 0.0) or 0.0
                    total_shares_sold = tx['quantity']
                    # Calculate total net sale value (revenue - fees)
                    total_net_sale_value = (tx['price'] * total_shares_sold) - tx_fees
                    # Calculate proportional value: only count the portion held >3 years
                    proportional_value = (shares_held_more_than_3_years / total_shares_sold) * total_net_sale_value
                    total_sales += proportional_value
    
    return total_sales

def calculate_tax_free_capacity(sales_total):
    """
    Calculate remaining tax-free capacity.
    Returns remaining capacity (100k - sales_total), minimum 0.
    """
    remaining = Config.TAX_FREE_LIMIT - sales_total
    return max(0, remaining)

def aggregate_holdings_by_stock(holdings):
    """
    Aggregate holdings by stock name, summing quantities and calculating average purchase price.
    """
    aggregated = defaultdict(lambda: {
        'quantity': 0,
        'total_cost': 0,
        'purchases': []
    })
    
    for holding in holdings:
        stock_name = holding['stock_name']
        quantity = holding['quantity']
        price = holding['purchase_price']
        
        aggregated[stock_name]['quantity'] += quantity
        aggregated[stock_name]['total_cost'] += quantity * price
        aggregated[stock_name]['purchases'].append({
            'date': holding['purchase_date'],
            'price': price,
            'quantity': quantity
        })
    
    # Calculate average purchase price
    result = {}
    for stock_name, data in aggregated.items():
        avg_price = data['total_cost'] / data['quantity'] if data['quantity'] > 0 else 0
        result[stock_name] = {
            'quantity': data['quantity'],
            'average_purchase_price': avg_price,
            'total_cost': data['total_cost'],
            'purchases': data['purchases']
        }
    
    return result

