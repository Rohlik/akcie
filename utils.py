"""
Utility functions for input validation, sanitization, and error handling
"""
import re
from datetime import datetime, date
from typing import Dict, Any, Optional, Tuple
from flask import jsonify
from config import Config

def sanitize_input(text: str, max_length: Optional[int] = None) -> str:
    """
    Sanitize user input to prevent XSS and SQL injection attempts.
    
    Args:
        text: Input string to sanitize
        max_length: Maximum allowed length
        
    Returns:
        Sanitized string
    """
    if not isinstance(text, str):
        text = str(text)
    
    # Remove potentially dangerous characters
    # Allow alphanumeric, spaces, dots, dashes, underscores, parentheses
    text = re.sub(r'[^a-zA-Z0-9\s\.\-_()]', '', text)
    
    # Trim whitespace
    text = text.strip()
    
    # Enforce length limit
    if max_length and len(text) > max_length:
        text = text[:max_length]
    
    return text

def sanitize_stock_name(stock_name: str) -> str:
    """Sanitize stock name specifically"""
    return sanitize_input(stock_name, max_length=Config.MAX_STOCK_NAME_LENGTH)

def validate_date(date_str: str, allow_future: bool = False) -> Tuple[bool, Optional[str]]:
    """
    Validate date string format and range.
    
    Args:
        date_str: Date string in YYYY-MM-DD format
        allow_future: Whether to allow future dates
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # Check if date is too far in the past (before 1900)
        if parsed_date < date(1900, 1, 1):
            return False, "Date cannot be before 1900"
        
        # Check if date is in the future
        if not allow_future and parsed_date > date.today():
            return False, "Date cannot be in the future"
        
        return True, None
    except ValueError:
        return False, "Invalid date format. Use YYYY-MM-DD"

def validate_price(price: float) -> Tuple[bool, Optional[str]]:
    """Validate price value"""
    if price <= 0:
        return False, "Price must be greater than 0"
    if price > Config.MAX_PRICE:
        return False, f"Price cannot exceed {Config.MAX_PRICE:,.0f} CZK"
    return True, None

def validate_quantity(quantity: int) -> Tuple[bool, Optional[str]]:
    """Validate quantity value"""
    if quantity <= 0:
        return False, "Quantity must be greater than 0"
    if quantity > Config.MAX_QUANTITY:
        return False, f"Quantity cannot exceed {Config.MAX_QUANTITY:,}"
    return True, None

def validate_fees(fees: float) -> Tuple[bool, Optional[str]]:
    """Validate fees value"""
    if fees < 0:
        return False, "Fees cannot be negative"
    if fees > Config.MAX_FEES:
        return False, f"Fees cannot exceed {Config.MAX_FEES:,.0f} CZK"
    return True, None

def validate_transaction_data(data: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate transaction data.
    
    Returns:
        Tuple of (is_valid, error_message, sanitized_data)
    """
    # Validate transaction type
    transaction_type = data.get('type')
    if transaction_type not in ['buy', 'sell']:
        return False, "Invalid transaction type. Must be 'buy' or 'sell'", None
    
    # Sanitize and validate stock name
    stock_name = data.get('stock_name', '').strip()
    if not stock_name:
        return False, "Stock name is required", None
    stock_name = sanitize_stock_name(stock_name)
    if not stock_name:
        return False, "Stock name cannot be empty", None
    
    # Validate date
    date_str = data.get('date', '').strip()
    if not date_str:
        return False, "Date is required", None
    is_valid_date, date_error = validate_date(date_str)
    if not is_valid_date:
        return False, date_error, None
    
    # Validate price
    try:
        price = float(data.get('price', 0))
    except (ValueError, TypeError):
        return False, "Invalid price value", None
    is_valid_price, price_error = validate_price(price)
    if not is_valid_price:
        return False, price_error, None
    
    # Validate quantity
    try:
        quantity = int(data.get('quantity', 0))
    except (ValueError, TypeError):
        return False, "Invalid quantity value", None
    is_valid_quantity, quantity_error = validate_quantity(quantity)
    if not is_valid_quantity:
        return False, quantity_error, None
    
    # Validate fees
    try:
        fees = float(data.get('fees', 0.0)) or 0.0
    except (ValueError, TypeError):
        fees = 0.0
    is_valid_fees, fees_error = validate_fees(fees)
    if not is_valid_fees:
        return False, fees_error, None
    
    sanitized_data = {
        'type': transaction_type,
        'stock_name': stock_name,
        'date': date_str,
        'price': price,
        'quantity': quantity,
        'fees': fees
    }
    
    return True, None, sanitized_data

def create_error_response(error_message: str, error_code: str = 'GENERIC_ERROR', status_code: int = 400) -> tuple:
    """
    Create standardized error response.
    
    Args:
        error_message: Human-readable error message
        error_code: Machine-readable error code
        status_code: HTTP status code
        
    Returns:
        Tuple of (jsonify response, status_code)
    """
    return jsonify({
        'success': False,
        'error': {
            'message': error_message,
            'code': error_code
        }
    }), status_code

def create_success_response(data: Optional[Dict[str, Any]] = None, message: str = 'Success', status_code: int = 200) -> tuple:
    """
    Create standardized success response.
    
    Args:
        data: Response data
        message: Success message
        status_code: HTTP status code
        
    Returns:
        Tuple of (jsonify response, status_code)
    """
    response = {
        'success': True,
        'message': message
    }
    if data:
        response.update(data)
    return jsonify(response), status_code

