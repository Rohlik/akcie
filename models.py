import sqlite3
import os
from datetime import datetime
from config import Config

def get_db():
    """Get database connection"""
    db_path = Config.DATABASE_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with required tables"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Create transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
            stock_name TEXT NOT NULL,
            date DATE NOT NULL,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            fees REAL DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Migrate existing database: add fees column if it doesn't exist
    try:
        cursor.execute('ALTER TABLE transactions ADD COLUMN fees REAL DEFAULT 0.0')
        conn.commit()
    except sqlite3.OperationalError:
        # Column already exists, ignore
        pass
    
    # Create stock_prices table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stock_prices (
            stock_name TEXT PRIMARY KEY,
            current_price REAL,
            last_updated TIMESTAMP,
            status TEXT DEFAULT 'unavailable' CHECK(status IN ('available', 'unavailable', 'error'))
        )
    ''')
    
    conn.commit()
    conn.close()

def add_transaction(transaction_type, stock_name, date, price, quantity, fees=0.0):
    """Add a new transaction"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO transactions (type, stock_name, date, price, quantity, fees)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (transaction_type, stock_name, date, price, quantity, fees))
    conn.commit()
    transaction_id = cursor.lastrowid
    conn.close()
    return transaction_id

def get_all_transactions():
    """Get all transactions ordered by date"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM transactions
        ORDER BY date ASC, created_at ASC
    ''')
    transactions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return transactions

def update_stock_price(stock_name, current_price, status='available'):
    """Update or insert stock price"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO stock_prices (stock_name, current_price, last_updated, status)
        VALUES (?, ?, ?, ?)
    ''', (stock_name, current_price, datetime.now().isoformat(), status))
    conn.commit()
    conn.close()

def get_stock_price(stock_name):
    """Get cached stock price"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM stock_prices WHERE stock_name = ?
    ''', (stock_name,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_stock_prices():
    """Get all cached stock prices"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM stock_prices')
    prices = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return prices

