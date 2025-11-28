import os
import logging

class Config:
    # Security
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = 3600  # 1 hour
    
    # Database
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'instance', 'portfolio.db')
    
    # Tax Configuration
    TAX_FREE_LIMIT = 100000  # 100k CZK
    THREE_YEAR_EXEMPTION_DAYS = 3 * 365  # 3 years in days
    
    # Input Validation
    MAX_STOCK_NAME_LENGTH = 40
    MAX_PRICE = 1000000  # 1M CZK per share
    MAX_QUANTITY = 1000000  # 1M shares
    MAX_FEES = 1000  # 1K CZK
    
    # Logging
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    LOG_FILE = os.environ.get('LOG_FILE', 'app.log')
    
    # Cache Configuration
    CACHE_TTL = 300  # 5 minutes
    
    @staticmethod
    def validate_secret_key():
        """Warn if using default secret key"""
        if Config.SECRET_KEY == 'dev-secret-key-change-in-production':
            import warnings
            warnings.warn(
                "Using default SECRET_KEY! Set SECRET_KEY environment variable for production.",
                UserWarning
            )

