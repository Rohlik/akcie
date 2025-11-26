from datetime import datetime, timedelta
from collections import defaultdict
from config import Config

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
    Tax year is January 1 to December 31.
    For sell transactions: revenue = (price * quantity) - fees
    """
    if current_year is None:
        current_year = datetime.now().year
    
    year_start = datetime(current_year, 1, 1).date()
    year_end = datetime(current_year, 12, 31).date()
    
    total_sales = 0
    for tx in transactions:
        if tx['type'] == 'sell':
            tx_date = datetime.strptime(tx['date'], '%Y-%m-%d').date()
            if year_start <= tx_date <= year_end:
                tx_fees = tx.get('fees', 0.0) or 0.0
                # Net sale value = (price * quantity) - fees
                total_sales += (tx['price'] * tx['quantity']) - tx_fees
    
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

