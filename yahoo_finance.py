import yfinance as yf
from datetime import datetime
from models import update_stock_price, get_stock_price

def fetch_stock_price(stock_name):
    """
    Fetch current stock price from Yahoo Finance.
    Handles Prague Stock Exchange symbols (e.g., TABAK.PR).
    Returns price in CZK or None on error.
    """
    try:
        # For Prague Stock Exchange, symbols typically end with .PR
        # If not, try adding .PR suffix
        symbol = stock_name
        if not symbol.endswith('.PR'):
            # Try with .PR suffix for Prague Stock Exchange
            symbol = f"{stock_name}.PR"
        
        ticker = yf.Ticker(symbol)
        info = ticker.info
        
        # Try to get current price
        price = None
        
        # Try different price fields
        if 'currentPrice' in info and info['currentPrice']:
            price = info['currentPrice']
        elif 'regularMarketPrice' in info and info['regularMarketPrice']:
            price = info['regularMarketPrice']
        elif 'previousClose' in info and info['previousClose']:
            price = info['previousClose']
        else:
            # Try getting latest price from history
            hist = ticker.history(period="1d")
            if not hist.empty:
                price = float(hist['Close'].iloc[-1])
        
        if price is None:
            update_stock_price(stock_name, None, 'unavailable')
            return None
        
        # Check if currency conversion is needed
        currency = info.get('currency', 'CZK')
        if currency != 'CZK':
            # For now, assume price is already in CZK or we'll need exchange rate
            # In production, you might want to add currency conversion here
            pass
        
        # Update cache
        update_stock_price(stock_name, price, 'available')
        return price
        
    except Exception as e:
        # Mark as error in cache
        update_stock_price(stock_name, None, 'error')
        print(f"Error fetching price for {stock_name}: {e}")
        return None

def update_all_prices(stock_names):
    """
    Batch update prices for multiple stocks.
    Returns dictionary of stock_name -> price (or None if unavailable).
    """
    results = {}
    for stock_name in stock_names:
        price = fetch_stock_price(stock_name)
        results[stock_name] = price
    return results

def get_cached_price(stock_name):
    """Get cached price if available"""
    cached = get_stock_price(stock_name)
    if cached and cached['status'] == 'available':
        return cached['current_price']
    return None

