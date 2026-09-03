from datetime import date, datetime
from collections import defaultdict
from config import Config

def add_years(d, years):
    """Date `years` calendar years after `d`. 29 February maps to 28 February."""
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, month=2, day=28)

def three_year_test_met(purchase_date, sale_date):
    """
    True when the holding period from `purchase_date` to `sale_date` passes the
    3-year time test and the sale is therefore exempt.

    The period must *exceed* three calendar years, so a sale on the anniversary
    itself is still taxable. This single predicate decides both sides of the
    split, which is what keeps the taxable and exempt totals from overlapping.
    """
    return sale_date > add_years(purchase_date, Config.THREE_YEAR_EXEMPTION_YEARS)

def by_transaction_date(transactions):
    """Chronological order, matching the ORDER BY the database applies."""
    return sorted(transactions, key=lambda tx: (tx['date'], tx.get('created_at') or ''))

def consume_fifo(lots, quantity, sale_date):
    """
    Take `quantity` shares from `lots` oldest-first, mutating `lots`: emptied
    lots are removed and a partially sold lot has its quantity reduced.

    Returns a list of (lot, taken) for each lot touched, where `taken` is the
    share count drawn from it - read that, not lot['quantity'], which by then
    holds the remainder. Lots acquired after `sale_date` are skipped rather
    than sold, and any quantity left unsatisfied is silently ignored; callers
    that care about overselling use validate_no_oversell().

    Every FIFO consumer in this module goes through here. Holding the walk in
    one place is what stops the callers' share counts from drifting apart.
    """
    lots.sort(key=lambda lot: lot['date'])

    consumed = []
    i = 0
    while quantity > 0 and i < len(lots):
        lot = lots[i]
        if lot['date'] > sale_date:
            i += 1
            continue

        if lot['quantity'] <= quantity:
            taken = lot['quantity']
            quantity -= taken
            lots.pop(i)
            # Don't increment i: the next lot moved into this position.
        else:
            taken = quantity
            lot['quantity'] -= taken
            quantity = 0
        consumed.append((lot, taken))

    return consumed

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

    for tx in by_transaction_date(transactions):
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
            consume_fifo(holdings[stock_name], tx_quantity, tx_date)


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
    
    three_year_holdings = []
    for holding in holdings:
        purchase_date = holding['purchase_date']
        if isinstance(purchase_date, str):
            purchase_date = datetime.strptime(purchase_date, '%Y-%m-%d').date()

        if three_year_test_met(purchase_date, current_date):
            three_year_holdings.append(holding)
    
    # Aggregate by stock name
    aggregated = defaultdict(lambda: {'quantity': 0, 'total_value': 0})
    for holding in three_year_holdings:
        stock_name = holding['stock_name']
        aggregated[stock_name]['quantity'] += holding['quantity']
        aggregated[stock_name]['total_value'] += holding['quantity'] * holding['purchase_price']
    
    return dict(aggregated)

def _split_year_sales(transactions, year):
    """
    Net proceeds of `year`'s sales, split into (taxable, exempt) by the 3-year
    time test, applied per lot.

    A single sale can straddle the test - older lots exempt, newer ones not -
    so the proceeds are apportioned by share count. Both halves come out of one
    pass so they always partition the year's sales exactly: no sale can be
    counted in both buckets or in neither.
    """
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    lots_by_stock = defaultdict(list)
    taxable = 0
    exempt = 0

    for tx in by_transaction_date(transactions):
        stock_name = tx['stock_name']
        tx_date = datetime.strptime(tx['date'], '%Y-%m-%d').date()

        if tx['type'] == 'buy':
            lots_by_stock[stock_name].append({
                'date': tx_date,
                'quantity': tx['quantity'],
            })
            continue

        if tx['type'] != 'sell':
            continue

        consumed = consume_fifo(lots_by_stock[stock_name], tx['quantity'], tx_date)

        # The FIFO walk has to run for every sale to keep the lot pool correct,
        # but only sales inside the selected year contribute to the totals.
        if not (year_start <= tx_date <= year_end):
            continue

        shares_exempt = sum(
            taken for lot, taken in consumed if three_year_test_met(lot['date'], tx_date)
        )
        shares_taxable = sum(
            taken for lot, taken in consumed if not three_year_test_met(lot['date'], tx_date)
        )

        total_shares_sold = tx['quantity']
        tx_fees = tx.get('fees', 0.0) or 0.0
        net_value = (tx['price'] * total_shares_sold) - tx_fees

        if shares_taxable > 0:
            taxable += (shares_taxable / total_shares_sold) * net_value
        if shares_exempt > 0:
            exempt += (shares_exempt / total_shares_sold) * net_value

    return taxable, exempt

def calculate_current_year_sales(transactions, current_year=None):
    """
    Net proceeds of the year's sales that count against the 100k limit, i.e.
    those that failed the 3-year time test.
    """
    year = current_year if current_year is not None else datetime.now().year
    return _split_year_sales(transactions, year)[0]

def calculate_current_year_sales_three_years(transactions, current_year=None):
    """
    Net proceeds of the year's sales that passed the 3-year time test. These
    are exempt regardless of amount and never count against the 100k limit.
    """
    year = current_year if current_year is not None else datetime.now().year
    return _split_year_sales(transactions, year)[1]

def calculate_yearly_profit_loss(transactions):
    """
    Calculate profit/loss per calendar year for sold stocks using FIFO.
    Cost basis includes buy fees; sale value subtracts sell fees.
    Returns a list of dicts (year, total_sales, total_cost, profit_loss), sorted by year desc.
    """
    holdings = defaultdict(list)
    yearly_stats = defaultdict(lambda: {'total_sales': 0.0, 'total_cost': 0.0})

    for tx in by_transaction_date(transactions):
        stock_name = tx['stock_name']
        tx_date = datetime.strptime(tx['date'], '%Y-%m-%d').date()
        tx_price = tx['price']
        tx_quantity = tx['quantity']
        tx_fees = tx.get('fees', 0.0) or 0.0

        if tx['type'] == 'buy':
            cost_basis = (tx_price * tx_quantity) + tx_fees
            effective_price = cost_basis / tx_quantity if tx_quantity > 0 else tx_price
            holdings[stock_name].append({
                'date': tx_date,
                'price': effective_price,
                'quantity': tx_quantity,
            })
        elif tx['type'] == 'sell':
            year = tx_date.year
            net_sales_value = (tx_price * tx_quantity) - tx_fees
            yearly_stats[year]['total_sales'] += net_sales_value

            for lot, taken in consume_fifo(holdings[stock_name], tx_quantity, tx_date):
                yearly_stats[year]['total_cost'] += taken * lot['price']

    return [
        {
            'year': year,
            'total_sales': yearly_stats[year]['total_sales'],
            'total_cost': yearly_stats[year]['total_cost'],
            'profit_loss': yearly_stats[year]['total_sales'] - yearly_stats[year]['total_cost'],
        }
        for year in sorted(yearly_stats.keys(), reverse=True)
    ]

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

