from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
from models import init_db, add_transaction, get_all_transactions, get_all_stock_prices
from tax_calculator import (
    calculate_holdings,
    get_three_year_holdings,
    calculate_current_year_sales,
    calculate_tax_free_capacity,
    aggregate_holdings_by_stock
)
from yahoo_finance import update_all_prices, get_cached_price
from config import Config

app = Flask(__name__)
app.config.from_object(Config)

# Initialize database on startup
with app.app_context():
    init_db()

@app.route('/')
def index():
    """Main dashboard"""
    return render_template('index.html')

@app.route('/api/transaction', methods=['POST'])
def add_transaction_api():
    """Add a new buy/sell transaction"""
    try:
        data = request.get_json()
        
        transaction_type = data.get('type')
        stock_name = data.get('stock_name')
        date = data.get('date')
        price = float(data.get('price'))
        quantity = int(data.get('quantity'))
        
        # Validate
        if transaction_type not in ['buy', 'sell']:
            return jsonify({'error': 'Invalid transaction type'}), 400
        
        if not stock_name or not date or price <= 0 or quantity <= 0:
            return jsonify({'error': 'Invalid input data'}), 400
        
        # Validate date format
        try:
            datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        transaction_id = add_transaction(transaction_type, stock_name, date, price, quantity)
        
        return jsonify({
            'success': True,
            'transaction_id': transaction_id,
            'message': 'Transaction added successfully'
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
        return jsonify({'error': str(e)}), 500

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
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-prices', methods=['POST'])
def update_prices_api():
    """Fetch current prices from Yahoo Finance"""
    try:
        transactions = get_all_transactions()
        holdings = calculate_holdings(transactions)
        
        # Get unique stock names
        stock_names = list(set(h['stock_name'] for h in holdings))
        
        if not stock_names:
            return jsonify({'message': 'No stocks to update'}), 200
        
        # Update prices
        results = update_all_prices(stock_names)
        
        updated = sum(1 for price in results.values() if price is not None)
        failed = len(stock_names) - updated
        
        return jsonify({
            'success': True,
            'updated': updated,
            'failed': failed,
            'results': results
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transactions', methods=['GET'])
def get_transactions_api():
    """List all transactions"""
    try:
        transactions = get_all_transactions()
        return jsonify({'transactions': transactions}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)

