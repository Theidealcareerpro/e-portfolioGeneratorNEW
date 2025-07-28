const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({ auth: process.env.GH_TOKEN });

const generateCV = async (req, res) => {
  try {
    const { name, email } = req.body;
    const { cv } = req.files || {};

    if (!name || name.length < 2) return res.status(400).json({ message: 'Name must be at least 2 characters' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Valid email is required' });
    if (!cv || cv.mimetype !== 'application/pdf') return res.status(400).json({ message: 'CV must be a PDF' });
    if (cv.size > 10 * 1024 * 1024) return res.status(400).json({ message: 'CV must be under 10MB' });

    // Save metadata to Supabase
    const { data, error } = await supabase
      .from('cvs')
      .insert({
        name, email,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error.message);
      return res.status(500).json({ message: 'Failed to save CV metadata' });
    }

    const cvId = data.id;

    // Upload PDF to GitHub
    const path = `cvs/${cvId}/cv.pdf`;
    try {
      const response = await octokit.repos.createOrUpdateFileContents({
        owner: process.env.GH_OWNER,
        repo: process.env.GH_REPO,
        path,
        message: `CV for ${name}`,
        content: Buffer.from(cv.data).toString('base64')
      });
      const cvUrl = response.data.content.download_url;

      // Update CV with URL
      const { error: updateError } = await supabase
        .from('cvs')
        .update({ cv_url: cvUrl })
        .eq('id', cvId);

      if (updateError) {
        console.error('Supabase update error:', updateError.message);
        return res.status(500).json({ message: 'Failed to update CV URL' });
      }

      res.status(200).json({ cv_url: cvUrl });
    } catch (githubError) {
      console.error('GitHub upload error:', githubError.message);
      return res.status(500).json({ message: 'Failed to upload CV to GitHub' });
    }
  } catch (error) {
    console.error('CV generation error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to generate CV' });
  }
};

module.exports = generateCV;
