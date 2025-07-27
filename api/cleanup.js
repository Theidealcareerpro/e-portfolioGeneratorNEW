const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const octokit = new Octokit({ auth: process.env.GH_TOKEN });

  try {
    // Verify webhook secret
    const secret = event.headers['x-webhook-secret'];
    if (secret !== process.env.SUPABASE_DB_WEBHOOK_SECRET) {
      throw new Error('Invalid webhook secret');
    }

    // Parse webhook payload
    const { record } = JSON.parse(event.body);
    if (!record || !record.portfolio_url) {
      throw new Error('Invalid webhook payload');
    }

    // Extract repo name from portfolio_url
    const repoName = record.portfolio_url.split('/').pop();

    // Delete GitHub repository
    await octokit.repos.delete({
      owner: process.env.GH_ORG,
      repo: repoName
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://theidealcareerprogenerator.netlify.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ message: 'Portfolio deleted' })
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://theidealcareerprogenerator.netlify.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
