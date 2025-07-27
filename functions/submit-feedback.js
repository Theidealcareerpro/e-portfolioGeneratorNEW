const querystring = require('querystring');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const data = querystring.parse(event.body);
    if (!data.message) {
      throw new Error('No message provided in form data');
    }
    console.log('Feedback received:', data.message);
    return {
      statusCode: 302,
      headers: { Location: 'https://theidealcareerprogenerator.netlify.app/feedback-success.html' },
      body: ''
    };
  } catch (error) {
    console.error('Error processing feedback:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process feedback' })
    };
  }
};
