const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');

exports.handler = async (event) => {
  if (event.headers['supabase_db_webhook_secret'] !== process.env.SUPABASE_DB_WEBHOOK_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY // Use service_role key
  );
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  try {
    // Fetch expired portfolios
    const { data, error } = await supabase
      .from('portfolios')
      .select('id, portfolio_url')
      .lt('expires_at', new Date().toISOString());

    if (error) throw new Error(error.message);

    for (const portfolio of data) {
      const repoName = portfolio.portfolio_url.split('/').pop();
      // Delete GitHub repository
      await octokit.repos.delete({
        owner: process.env.GITHUB_ORG,
        repo: repoName
      });
      // Delete portfolio from Supabase
      await supabase.from('portfolios').delete().eq('id', portfolio.id);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Cleanup completed' })
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
