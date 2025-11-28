import sqlite3
import os
from datetime import datetime
from contextlib import contextmanager
from config import Config

@contextmanager
def get_db():
    """Get database connection as context manager"""
    db_path = Config.DATABASE_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Initialize database with required tables"""
    with get_db() as conn:
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
        
        # Create indexes for better query performance
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transactions_stock ON transactions(stock_name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)')
        
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
        
        # Create database version table for migrations
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Check current version
        cursor.execute('SELECT MAX(version) as version FROM schema_version')
        result = cursor.fetchone()
        current_version = result['version'] if result and result['version'] else 0
        
        # Apply migrations if needed
        if current_version < 1:
            # Migration 1: fees column (already handled above)
            cursor.execute('INSERT INTO schema_version (version) VALUES (1)')
        
        conn.commit()

def add_transaction(transaction_type, stock_name, date, price, quantity, fees=0.0):
    """Add a new transaction"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO transactions (type, stock_name, date, price, quantity, fees)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (transaction_type, stock_name, date, price, quantity, fees))
        conn.commit()
        transaction_id = cursor.lastrowid
    return transaction_id

def get_all_transactions():
    """Get all transactions ordered by date"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM transactions
            ORDER BY date ASC, created_at ASC
        ''')
        transactions = [dict(row) for row in cursor.fetchall()]
    return transactions

def get_transaction(transaction_id):
    """Get a single transaction by ID"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM transactions WHERE id = ?
        ''', (transaction_id,))
        row = cursor.fetchone()
    return dict(row) if row else None

def update_transaction(transaction_id, date, price, quantity, fees):
    """Update an existing transaction"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE transactions
            SET date = ?, price = ?, quantity = ?, fees = ?
            WHERE id = ?
        ''', (date, price, quantity, fees, transaction_id))
        conn.commit()
        success = cursor.rowcount > 0
    return success

def delete_transaction(transaction_id):
    """Delete a transaction"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM transactions WHERE id = ?', (transaction_id,))
        conn.commit()
        success = cursor.rowcount > 0
    return success

def update_stock_price(stock_name, current_price, status='available'):
    """Update or insert stock price"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO stock_prices (stock_name, current_price, last_updated, status)
            VALUES (?, ?, ?, ?)
        ''', (stock_name, current_price, datetime.now().isoformat(), status))
        conn.commit()

def get_stock_price(stock_name):
    """Get cached stock price"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM stock_prices WHERE stock_name = ?
        ''', (stock_name,))
        row = cursor.fetchone()
    return dict(row) if row else None

def get_all_stock_prices():
    """Get all cached stock prices"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM stock_prices')
        prices = [dict(row) for row in cursor.fetchall()]
    return prices

