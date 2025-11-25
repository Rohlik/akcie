import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'instance', 'portfolio.db')
    TAX_FREE_LIMIT = 100000  # 100k CZK
    THREE_YEAR_EXEMPTION_DAYS = 3 * 365  # 3 years in days

