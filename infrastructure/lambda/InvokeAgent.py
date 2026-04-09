import json
import os
import boto3
import uuid
from botocore.exceptions import ClientError
from aws_lambda_powertools.utilities.typing import LambdaContext
from common_utils import (
    logger, tracer, metrics, 
    bedrock_agent_runtime,
    DecimalEncoder,
    create_response, 
    handle_client_error, 
    handle_general_exception,
    handle_options_request
)

# Get environment variables
AGENT_ID = os.environ.get('AGENT_ID')
AGENT_ALIAS_ID = 'TSTALIASID'

@logger.inject_lambda_context
@tracer.capture_lambda_handler
@metrics.log_metrics
def handler(event, context: LambdaContext):
    """
    Lambda function handler to invoke a Bedrock Agent
    
    Args:
        event (dict): API Gateway Lambda Proxy Input Format
        context (object): Lambda Context Runtime Methods and Attributes
        
    Returns:
        dict: API Gateway Lambda Proxy Output Format
    """
    try:
        # Handle OPTIONS request for CORS
        options_response = handle_options_request(event)
        if options_response:
            return options_response

        # Parse the request body
        if 'body' not in event:
            return create_response(event, 400, {"error": "Missing request body"})
        
        try:
            body = json.loads(event['body'])
        except json.JSONDecodeError:
            return create_response(event, 400, {"error": "Invalid JSON in request body"})
        
        # Extract query from request body
        if 'query' not in body:
            return create_response(event, 400, {"error": "Missing 'query' parameter in request body"})
        
        query = body['query']
        
        # Extract sessionId from request body (if provided)
        session_id = body.get('sessionId')

        # Check if Agent ID is configured
        if not AGENT_ID or not AGENT_ALIAS_ID:
            return create_response(event, 500, {"error": "Agent ID or Agent Alias ID not configured"})
        
        # Invoke the Bedrock Agent
        response, used_session_id = invoke_agent(query, session_id)
        
        # Return the response with the session ID
        return create_response(event, 200, {
            "results": response,
            "sessionId": used_session_id
        })
    
    except ClientError as e:
        return handle_client_error(event, e, "BedrockAgentError")
    except Exception as e:
        return handle_general_exception(event, e, "InvokeAgentError")

@tracer.capture_method
def invoke_agent(query, session_id=None):
    """
    Invoke the Bedrock Agent with the given query
    
    Args:
        query (str): The user's query to the agent
        session_id (str, optional): The session ID to maintain conversation context
        
    Returns:
        tuple: (dict, str) - The agent's response and the session ID used
    """
    try:
        # Get knowledge base ID from environment variables
        knowledge_base_id = os.environ.get('KNOWLEDGE_BASE_ID')
        
        # Configure knowledge base with hybrid search
        knowledge_base_config = []
        if knowledge_base_id:
            knowledge_base_config = [{
                'knowledgeBaseId': knowledge_base_id,
                'retrievalConfiguration': {
                    'vectorSearchConfiguration': {
                        'numberOfResults': 5,  # Number of results to return
                        'overrideSearchType': 'HYBRID'  # Enable hybrid search (semantic & text)
                    }
                }
            }]
            logger.info(f"Using knowledge base with hybrid search: {knowledge_base_id}")
        else:
            logger.warning("No knowledge base ID found in environment variables")
        
        # Use provided session ID or generate a new one
        if not session_id:
            session_id = f"session-{uuid.uuid4()}"
            logger.info(f"Generated new session ID: {session_id}")
        else:
            logger.info(f"Using existing session ID: {session_id}")
        
        #log agent id and agent alias id
        logger.info(f"Agent ID: {AGENT_ID}")
        logger.info(f"Agent Alias ID: {AGENT_ALIAS_ID}")

        # Invoke the agent
        invoke_params = {
            'agentId': AGENT_ID,
            'agentAliasId': AGENT_ALIAS_ID,
            'sessionId': session_id,
            'inputText': query
        }
        
        # Add knowledge base configurations to sessionState if available
        if knowledge_base_config:
            invoke_params['sessionState'] = {
                'knowledgeBaseConfigurations': knowledge_base_config
            }
            
        # Invoke the agent and process the EventStream response
        response = bedrock_agent_runtime.invoke_agent(**invoke_params)
        
        # Process the EventStream response
        processed_response = process_agent_response(response)
        
        return processed_response, session_id
    
    except ClientError as e:
        logger.error(f"Error invoking Bedrock Agent: {e}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise e

@tracer.capture_method
def process_agent_response(response):
    """
    Process the EventStream response from the Bedrock Agent
    
    Args:
        response (dict): The raw response from invoke_agent
        
    Returns:
        dict: Processed response with text content, citations, and other relevant information
    """
    try:
        result = {
            'text': '',
            'citations': [],
            'traces': []
        }

        # Process the EventStream completion
        if 'completion' in response:
            # Iterate through events in completion
            for i, event in enumerate(response['completion']):

                # Process text chunks
                if 'chunk' in event:
                    chunk = event['chunk']

                    # Handle bytes content
                    if hasattr(chunk, 'bytes') and chunk.bytes:
                        chunk_text = chunk.bytes.decode('utf-8')
                        result['text'] += chunk_text
                    elif isinstance(chunk, dict):
                        # Try to extract text from dictionary structure
                        if 'bytes' in chunk:
                            if isinstance(chunk['bytes'], bytes):
                                chunk_text = chunk['bytes'].decode('utf-8')
                                result['text'] += chunk_text
                            else:
                                logger.warning(f"Chunk bytes is not bytes type: {type(chunk['bytes'])}")
                        elif 'text' in chunk:
                            result['text'] += chunk['text']
                    else:
                        logger.warning(f"Chunk has no bytes attribute and is not a dict: {chunk}")
                    
                    # Process citations if available
                    if isinstance(chunk, dict) and 'attribution' in chunk:
                        
                        # Check if citations exist in the attribution
                        if 'citations' in chunk['attribution']:
                            for citation_idx, citation in enumerate(chunk['attribution']['citations']):
                                citation_data = {}
                                
                                # Extract text span information
                                if 'generatedResponsePart' in citation and 'textResponsePart' in citation['generatedResponsePart']:
                                    text_part = citation['generatedResponsePart']['textResponsePart']
                                    if 'text' in text_part:
                                        citation_data['text'] = text_part['text']
                                    if 'span' in text_part:
                                        citation_data['span'] = text_part['span']
                                
                                # Extract reference information
                                if 'retrievedReferences' in citation:
                                    references = []
                                    for ref_idx, ref in enumerate(citation['retrievedReferences']):
                                        ref_data = {}
                                        
                                        # Extract content
                                        if 'content' in ref:
                                            if isinstance(ref['content'], dict):
                                                if 'text' in ref['content']:
                                                    ref_data['content'] = ref['content']['text']
                                            else:
                                                logger.warning(f"Reference content is not a dict: {type(ref['content'])}")
                                        
                                        # Extract location information
                                        if 'location' in ref:
                                            ref_data['location'] = ref['location']
                                        
                                        # Extract metadata
                                        if 'metadata' in ref:
                                            ref_data['metadata'] = ref['metadata']
                                        
                                        references.append(ref_data)
                                    
                                    citation_data['references'] = references
                                
                                result['citations'].append(citation_data)
                        else:
                            logger.warning("Attribution found but no citations key in it")
                    
                    # Check for alternative citation formats
                    if hasattr(chunk, 'attribution'):
                        try:
                            # Try to access citations as an attribute
                            if hasattr(chunk.attribution, 'citations'):
                                for citation in chunk.attribution.citations:
                                    citation_data = {'text': 'Citation from attribute access'}
                                    result['citations'].append(citation_data)
                        except Exception as attr_err:
                            logger.error(f"Error accessing attribution attributes: {attr_err}")
                
                # Process trace information
                if 'trace' in event:
                    trace_data = {}
                    
                    # Extract basic trace information
                    for key in ['agentId', 'agentAliasId', 'agentVersion', 'sessionId']:
                        if key in event['trace']:
                            trace_data[key] = event['trace'][key]
                    
                    # Extract detailed trace information if available
                    if 'trace' in event['trace']:
                        inner_trace = event['trace']['trace']
                        
                        # Extract guardrail trace information
                        if 'guardrailTrace' in inner_trace:
                            guardrail_trace = inner_trace['guardrailTrace']
                            trace_data['guardrail'] = {
                                'action': guardrail_trace.get('action'),
                                'traceId': guardrail_trace.get('traceId')
                            }
                            
                            # Extract input/output assessments
                            if 'inputAssessments' in guardrail_trace:
                                trace_data['guardrail']['inputAssessments'] = guardrail_trace['inputAssessments']
                            if 'outputAssessments' in guardrail_trace:
                                trace_data['guardrail']['outputAssessments'] = guardrail_trace['outputAssessments']
                        
                        # Extract orchestration trace information
                        if 'orchestrationTrace' in inner_trace:
                            trace_data['orchestration'] = {
                                'modelInvocationInput': inner_trace['orchestrationTrace'].get('modelInvocationInput'),
                                'modelInvocationOutput': inner_trace['orchestrationTrace'].get('modelInvocationOutput')
                            }
                    
                    result['traces'].append(trace_data)
                
                # Process any errors
                for error_type in ['accessDeniedException', 'badGatewayException', 'conflictException', 
                                  'dependencyFailedException', 'internalServerException', 'modelNotReadyException',
                                  'resourceNotFoundException', 'serviceQuotaExceededException', 
                                  'throttlingException', 'validationException']:
                    if error_type in event:
                        result['error'] = {
                            'type': error_type,
                            'message': event[error_type].get('message', 'Unknown error')
                        }
                        logger.error(f"Agent error: {error_type} - {event[error_type]}")
        
        # Add content type and other metadata if available
        if 'contentType' in response:
            result['contentType'] = response['contentType']
        if 'memoryId' in response:
            result['memoryId'] = response['memoryId']
        
        # Log the final processed result
        if not result['text']:
            logger.warning("No text was extracted from the response")
        if not result['citations']:
            logger.warning("No citations were extracted from the response")
        return result
    
    except Exception as e:
        logger.error(f"Error processing agent response: {e}", exc_info=True)
        # Return a simplified response in case of processing error
        return {
            'text': 'Error processing agent response',
            'error': str(e)
        }