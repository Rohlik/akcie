from flask import Flask, render_template, request, jsonify
from flask_wtf.csrf import CSRFProtect, generate_csrf
from datetime import datetime, timedelta
import logging
from models import init_db, add_transaction, get_all_transactions, get_all_stock_prices, get_transaction, update_transaction, delete_transaction
from tax_calculator import (
    calculate_holdings,
    get_three_year_holdings,
    calculate_current_year_sales,
    calculate_tax_free_capacity,
    aggregate_holdings_by_stock
)
from yahoo_finance import update_all_prices, get_cached_price
from config import Config
from utils import sanitize_input, validate_transaction_data, create_error_response

# Configure logging
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Config.LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

# Initialize CSRF protection
csrf = CSRFProtect(app)

# Validate secret key on startup
Config.validate_secret_key()

# Initialize database on startup
with app.app_context():
    init_db()

@app.route('/api/csrf-token', methods=['GET'])
def get_csrf_token():
    """Get CSRF token for frontend"""
    return jsonify({'csrf_token': generate_csrf()})

@app.route('/')
def index():
    """Main dashboard"""
    return render_template('index.html')

@app.route('/api/transaction', methods=['POST'])
@csrf.exempt  # CSRF handled via token in request header
def add_transaction_api():
    """Add a new buy/sell transaction"""
    try:
        data = request.get_json()
        if not data:
            return create_error_response('No data provided', 'NO_DATA', 400)
        
        # Validate and sanitize input
        is_valid, error_msg, sanitized_data = validate_transaction_data(data)
        if not is_valid:
            return create_error_response(error_msg, 'VALIDATION_ERROR', 400)
        
        transaction_id = add_transaction(
            sanitized_data['type'],
            sanitized_data['stock_name'],
            sanitized_data['date'],
            sanitized_data['price'],
            sanitized_data['quantity'],
            sanitized_data['fees']
        )
        
        logger.info(f"Transaction added: ID={transaction_id}, Stock={sanitized_data['stock_name']}, Type={sanitized_data['type']}")
        return create_success_response(
            {'transaction_id': transaction_id},
            'Transaction added successfully',
            201
        )
        
    except Exception as e:
        logger.error(f"Error adding transaction: {e}", exc_info=True)
        return create_error_response('Internal server error', 'INTERNAL_ERROR', 500)

@app.route('/api/holdings', methods=['GET'])
def get_holdings_api():
    """Get current holdings with tax status"""
    try:
        transactions = get_all_transactions()
        holdings = calculate_holdings(transactions)
        aggregated = aggregate_holdings_by_stock(holdings)
        
        # Get current prices
        stock_prices = get_all_stock_prices()
        price_dict = {sp['stock_name']: sp['current_price'] for sp in stock_prices if sp['status'] == 'available'}
        
        # Get 3-year holdings
        three_year = get_three_year_holdings(holdings)
        
        # Build response
        holdings_list = []
        for stock_name, data in aggregated.items():
            current_price = price_dict.get(stock_name)
            three_year_data = three_year.get(stock_name, {'quantity': 0, 'total_value': 0})
            
            total_value = current_price * data['quantity'] if current_price else None
            profit_loss = (current_price - data['average_purchase_price']) * data['quantity'] if current_price else None
            
            holdings_list.append({
                'stock_name': stock_name,
                'quantity': data['quantity'],
                'three_year_quantity': three_year_data['quantity'],
                'average_purchase_price': data['average_purchase_price'],
                'current_price': current_price,
                'total_value': total_value,
                'profit_loss': profit_loss,
                'total_cost': data['total_cost']
            })
        
        return jsonify({'holdings': holdings_list}), 200
        
    except Exception as e:
        logger.error(f"Error getting holdings: {e}", exc_info=True)
        return create_error_response('Failed to load holdings', 'LOAD_ERROR', 500)

@app.route('/api/tax-info', methods=['GET'])
def get_tax_info_api():
    """Calculate tax-free capacity and 3-year holdings"""
    try:
        transactions = get_all_transactions()
        holdings = calculate_holdings(transactions)
        
        # Calculate current year sales
        current_year = datetime.now().year
        current_year_sales = calculate_current_year_sales(transactions, current_year)
        
        # Calculate remaining tax-free capacity
        remaining_capacity = calculate_tax_free_capacity(current_year_sales)
        
        # Get 3-year holdings
        three_year = get_three_year_holdings(holdings)
        
        # Calculate total value of 3-year holdings
        stock_prices = get_all_stock_prices()
        price_dict = {sp['stock_name']: sp['current_price'] for sp in stock_prices if sp['status'] == 'available'}
        
        three_year_total_value = 0
        for stock_name, data in three_year.items():
            current_price = price_dict.get(stock_name)
            if current_price:
                # Use quantity from three_year data
                three_year_total_value += current_price * data['quantity']
        
        return jsonify({
            'current_year_sales': current_year_sales,
            'remaining_tax_free_capacity': remaining_capacity,
            'tax_free_limit': Config.TAX_FREE_LIMIT,
            'three_year_holdings': three_year,
            'three_year_total_value': three_year_total_value
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting tax info: {e}", exc_info=True)
        return create_error_response('Failed to load tax information', 'LOAD_ERROR', 500)

@app.route('/api/update-prices', methods=['POST'])
@csrf.exempt
def update_prices_api():
    """Fetch current prices from Yahoo Finance"""
    try:
        transactions = get_all_transactions()
        holdings = calculate_holdings(transactions)
        
        # Get unique stock names
        stock_names = list(set(h['stock_name'] for h in holdings))
        
        if not stock_names:
            return create_success_response({'message': 'No stocks to update'})
        
        logger.info(f"Updating prices for {len(stock_names)} stocks")
        # Update prices (async handling will be added later)
        results = update_all_prices(stock_names)
        
        updated = sum(1 for price in results.values() if price is not None)
        failed = len(stock_names) - updated
        
        logger.info(f"Price update completed: {updated} updated, {failed} failed")
        return create_success_response({
            'updated': updated,
            'failed': failed,
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Error updating prices: {e}", exc_info=True)
        return create_error_response('Failed to update prices', 'UPDATE_ERROR', 500)

@app.route('/api/transactions', methods=['GET'])
def get_transactions_api():
    """List all transactions, optionally filtered by stock"""
    try:
        stock_name = request.args.get('stock')
        if stock_name:
            stock_name = sanitize_stock_name(stock_name)
        
        transactions = get_all_transactions()
        
        if stock_name:
            transactions = [tx for tx in transactions if tx['stock_name'] == stock_name]
        
        return jsonify({'transactions': transactions}), 200
    except Exception as e:
        logger.error(f"Error getting transactions: {e}", exc_info=True)
        return create_error_response('Failed to load transactions', 'LOAD_ERROR', 500)

@app.route('/api/transaction/<int:transaction_id>', methods=['PUT'])
@csrf.exempt
def update_transaction_api(transaction_id):
    """Update an existing transaction"""
    try:
        # Check if transaction exists
        transaction = get_transaction(transaction_id)
        if not transaction:
            return create_error_response('Transaction not found', 'NOT_FOUND', 404)
        
        data = request.get_json()
        if not data:
            return create_error_response('No data provided', 'NO_DATA', 400)
        
        # Merge with existing transaction type and stock_name for validation
        validation_data = {
            'type': transaction['type'],
            'stock_name': transaction['stock_name'],
            'date': data.get('date', transaction['date']),
            'price': data.get('price', transaction['price']),
            'quantity': data.get('quantity', transaction['quantity']),
            'fees': data.get('fees', transaction.get('fees', 0.0))
        }
        
        # Validate and sanitize input
        is_valid, error_msg, sanitized_data = validate_transaction_data(validation_data)
        if not is_valid:
            return create_error_response(error_msg, 'VALIDATION_ERROR', 400)
        
        # Update transaction
        success = update_transaction(
            transaction_id,
            sanitized_data['date'],
            sanitized_data['price'],
            sanitized_data['quantity'],
            sanitized_data['fees']
        )
        
        if not success:
            return create_error_response('Failed to update transaction', 'UPDATE_FAILED', 500)
        
        logger.info(f"Transaction updated: ID={transaction_id}")
        return create_success_response(message='Transaction updated successfully')
        
    except Exception as e:
        logger.error(f"Error updating transaction {transaction_id}: {e}", exc_info=True)
        return create_error_response('Internal server error', 'INTERNAL_ERROR', 500)

@app.route('/api/transaction/<int:transaction_id>', methods=['DELETE'])
@csrf.exempt
def delete_transaction_api(transaction_id):
    """Delete a transaction"""
    try:
        # Check if transaction exists
        transaction = get_transaction(transaction_id)
        if not transaction:
            return create_error_response('Transaction not found', 'NOT_FOUND', 404)
        
        # Delete transaction
        success = delete_transaction(transaction_id)
        
        if not success:
            return create_error_response('Failed to delete transaction', 'DELETE_FAILED', 500)
        
        logger.info(f"Transaction deleted: ID={transaction_id}")
        return create_success_response(message='Transaction deleted successfully')
        
    except Exception as e:
        logger.error(f"Error deleting transaction {transaction_id}: {e}", exc_info=True)
        return create_error_response('Internal server error', 'INTERNAL_ERROR', 500)

@app.route('/api/yearly-profit-loss', methods=['GET'])
def get_yearly_profit_loss_api():
    """Calculate profit/loss per calendar year for sold stocks using FIFO"""
    try:
        from collections import defaultdict
        
        transactions = get_all_transactions()
        
        # Sort transactions by date
        sorted_transactions = sorted(transactions, key=lambda x: datetime.strptime(x['date'], '%Y-%m-%d'))
        
        # Track holdings using FIFO
        holdings = defaultdict(list)  # stock_name -> list of (date, price, quantity)
        yearly_stats = defaultdict(lambda: {'total_sales': 0, 'total_cost': 0})
        
        for tx in sorted_transactions:
            stock_name = tx['stock_name']
            tx_date = datetime.strptime(tx['date'], '%Y-%m-%d').date()
            tx_price = tx['price']
            tx_quantity = tx['quantity']
            tx_fees = tx.get('fees', 0.0) or 0.0
            year = tx_date.year
            
            if tx['type'] == 'buy':
                # Calculate effective price per share including fees
                # Cost basis = (price * quantity) + fees
                cost_basis = (tx_price * tx_quantity) + tx_fees
                effective_price = cost_basis / tx_quantity if tx_quantity > 0 else tx_price
                
                # Add purchase to holdings with effective price (including fees)
                holdings[stock_name].append({
                    'date': tx_date,
                    'price': effective_price,
                    'quantity': tx_quantity
                })
            elif tx['type'] == 'sell':
                # Calculate net sales value (revenue - fees)
                # Net sale value = (price * quantity) - fees
                net_sales_value = (tx_price * tx_quantity) - tx_fees
                yearly_stats[year]['total_sales'] += net_sales_value
                
                # Apply FIFO to calculate cost basis
                remaining_to_sell = tx_quantity
                stock_holdings = holdings[stock_name]
                stock_holdings.sort(key=lambda x: x['date'])
                
                i = 0
                while remaining_to_sell > 0 and i < len(stock_holdings):
                    holding = stock_holdings[i]
                    purchase_date = holding['date']
                    
                    # Only use holdings purchased before or on sale date
                    if purchase_date <= tx_date:
                        if holding['quantity'] <= remaining_to_sell:
                            # This purchase is fully sold
                            yearly_stats[year]['total_cost'] += holding['quantity'] * holding['price']
                            remaining_to_sell -= holding['quantity']
                            stock_holdings.pop(i)
                        else:
                            # Partial sale of this purchase
                            yearly_stats[year]['total_cost'] += remaining_to_sell * holding['price']
                            holding['quantity'] -= remaining_to_sell
                            remaining_to_sell = 0
                    i += 1
        
        # Build response
        yearly_data = []
        for year in sorted(yearly_stats.keys(), reverse=True):
            stats = yearly_stats[year]
            profit_loss = stats['total_sales'] - stats['total_cost']
            
            yearly_data.append({
                'year': year,
                'total_sales': stats['total_sales'],
                'total_cost': stats['total_cost'],
                'profit_loss': profit_loss
            })
        
        return jsonify({'yearly_data': yearly_data}), 200
        
    except Exception as e:
        logger.error(f"Error calculating yearly profit/loss: {e}", exc_info=True)
        return create_error_response('Failed to calculate yearly profit/loss', 'CALCULATION_ERROR', 500)

@app.route('/api/export/transactions', methods=['GET'])
def export_transactions_csv():
    """Export all transactions as CSV"""
    try:
        import csv
        from io import StringIO
        from flask import Response
        
        transactions = get_all_transactions()
        
        output = StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(['ID', 'Typ', 'Akcie', 'Datum', 'Cena (CZK)', 'Množství', 'Poplatky (CZK)', 'Vytvořeno'])
        
        # Write data
        for tx in transactions:
            writer.writerow([
                tx['id'],
                'Nákup' if tx['type'] == 'buy' else 'Prodej',
                tx['stock_name'],
                tx['date'],
                tx['price'],
                tx['quantity'],
                tx.get('fees', 0.0) or 0.0,
                tx.get('created_at', '')
            ])
        
        output.seek(0)
        
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=transakce.csv'}
        )
        
    except Exception as e:
        logger.error(f"Error exporting transactions: {e}", exc_info=True)
        return create_error_response('Failed to export transactions', 'EXPORT_ERROR', 500)

@app.route('/api/export/tax-report', methods=['GET'])
def export_tax_report_csv():
    """Export tax report as CSV"""
    try:
        import csv
        from io import StringIO
        from flask import Response
        
        transactions = get_all_transactions()
        holdings = calculate_holdings(transactions)
        
        current_year = datetime.now().year
        current_year_sales = calculate_current_year_sales(transactions, current_year)
        remaining_capacity = calculate_tax_free_capacity(current_year_sales)
        
        output = StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(['Daňová zpráva'])
        writer.writerow(['Rok', str(current_year)])
        writer.writerow([])
        writer.writerow(['Prodeje v tomto roce (bez akcií držených >3 roky)', f'{current_year_sales:,.2f} CZK'])
        writer.writerow(['Zbývající daňově osvobozená kapacita', f'{remaining_capacity:,.2f} CZK'])
        writer.writerow(['Limit', f'{Config.TAX_FREE_LIMIT:,.2f} CZK'])
        writer.writerow([])
        writer.writerow(['Akcie držené déle než 3 roky'])
        
        three_year = get_three_year_holdings(holdings)
        for stock_name, data in three_year.items():
            writer.writerow([stock_name, f'Množství: {data["quantity"]}'])
        
        output.seek(0)
        
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=danova_zprava_{current_year}.csv'}
        )
        
    except Exception as e:
        logger.error(f"Error exporting tax report: {e}", exc_info=True)
        return create_error_response('Failed to export tax report', 'EXPORT_ERROR', 500)

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)

