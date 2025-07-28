const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({ auth: process.env.GH_TOKEN });

const cleanup = async (req, res) => {
  try {
    // Fetch expired portfolios
    const { data: portfolios, error } = await supabase
      .from('portfolios')
      .select('id, portfolio_url')
      .lte('expires_at', new Date().toISOString());

    if (error) {
      console.error('Supabase fetch error:', error.message);
      return res.status(500).json({ message: 'Failed to fetch expired portfolios' });
    }

    for (const portfolio of portfolios) {
      const { id, portfolio_url } = portfolio;

      // Delete from Supabase Storage
      await supabase.storage
        .from('portfolio-files')
        .remove([`images/${id}/`, `cvs/${id}/`]);

      // Delete from GitHub
      if (portfolio_url) {
        const path = `portfolios/${id}/portfolio.pdf`;
        try {
          const { data } = await octokit.repos.getContent({
            owner: process.env.GH_OWNER,
            repo: process.env.GH_REPO,
            path
          });
          await octokit.repos.deleteFile({
            owner: process.env.GH_OWNER,
            repo: process.env.GH_REPO,
            path,
            message: `Delete expired portfolio ${id}`,
            sha: data.sha
          });
        } catch (githubError) {
          if (githubError.status !== 404) {
            console.error('GitHub delete error:', githubError.message);
          }
        }
      }

      // Delete from Supabase database
      await supabase.from('portfolios').delete().eq('id', id);
    }

    res.status(200).json({ message: `Cleaned up ${portfolios.length} expired portfolios` });
  } catch (error) {
    console.error('Cleanup error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to clean up portfolios' });
  }
};

module.exports = cleanup;
