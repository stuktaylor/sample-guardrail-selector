import json
import os
import boto3
from decimal import Decimal
from datetime import datetime, date
from aws_lambda_powertools import Logger, Tracer, Metrics

# Initialize powertools
logger = Logger()
tracer = Tracer()
metrics = Metrics()

# Initialize AWS clients
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal and datetime objects."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)  # Convert Decimal to float
        elif isinstance(obj, (datetime, date)):
            return obj.isoformat()  # Convert datetime to ISO format string
        return super(DecimalEncoder, self).default(obj)

def get_cors_headers(event):
    """
    Generate CORS headers for API responses.
    
    Args:
        event: The Lambda event object
        
    Returns:
        dict: Dictionary containing CORS headers
    """
    # Get origin from the request headers
    origin = event.get('headers', {}).get('origin') or event.get('headers', {}).get('Origin')
    
    # For credentialed requests, we must specify the exact origin
    access_control_origin = origin if origin else 'http://localhost:8000'
    
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': os.environ.get('ALLOWED_HEADERS', 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'),
        'Access-Control-Allow-Methods': 'GET, OPTIONS, POST, PUT, DELETE',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': access_control_origin
    }
    return headers

def create_response(event, status_code, body):
    """
    Create a standardized API Gateway response.
    
    Args:
        event: The Lambda event object
        status_code (int): HTTP status code
        body (dict): Response body
        
    Returns:
        dict: Formatted API Gateway response
    """
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(event),
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def handle_options_request(event):
    """
    Handle OPTIONS preflight requests for CORS.
    
    Args:
        event: The Lambda event object
        
    Returns:
        dict: API Gateway response for OPTIONS request
    """
    if event.get('httpMethod') == 'OPTIONS':
        return create_response(event, 200, {})
    return None

def handle_client_error(event, e, metric_name="AWSClientError"):
    """
    Handle AWS client errors in a standardized way.
    
    Args:
        event: The Lambda event object
        e (ClientError): The AWS client error
        metric_name (str): Name of the metric to record
        
    Returns:
        dict: API Gateway error response
    """
    error_code = e.response.get('Error', {}).get('Code', 'Unknown')
    error_message = e.response.get('Error', {}).get('Message', str(e))
    logger.error(f"AWS Client Error: {error_code} - {error_message}")
    metrics.add_metric(name=metric_name, unit="Count", value=1)
    return create_response(event, 500, {'error': f"AWS Error: {error_code} - {error_message}"})

def handle_general_exception(event, e, metric_name="ProcessingError"):
    """
    Handle general exceptions in a standardized way.
    
    Args:
        event: The Lambda event object
        e (Exception): The exception
        metric_name (str): Name of the metric to record
        
    Returns:
        dict: API Gateway error response
    """
    logger.exception(f"Error processing request: {str(e)}")
    metrics.add_metric(name=metric_name, unit="Count", value=1)
    return create_response(event, 500, {'error': f"Internal server error"})
