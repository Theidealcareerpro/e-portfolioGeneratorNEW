const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const validatePortfolio = (req) => {
  const { name, email, profession } = req.body;
  const { image, cv, portfolio } = req.files || {};
  if (!name || name.length < 2) return { valid: false, message: 'Name must be at least 2 characters' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valid: false, message: 'Valid email is required' };
  if (!profession || profession.length < 2) return { valid: false, message: 'Profession must be at least 2 characters' };
  try {
    const skills = JSON.parse(req.body.skills || '[]');
    if (!skills.some(skill => skill.name && skill.name.trim())) return { valid: false, message: 'At least one skill is required' };
  } catch (e) { return { valid: false, message: 'Invalid skills format' }; }
  try {
    const projects = JSON.parse(req.body.projects || '[]');
    if (!projects.some(project => project.title && project.title.trim())) return { valid: false, message: 'At least one project is required' };
  } catch (e) { return { valid: false, message: 'Invalid projects format' }; }
  if (image && !['image/jpeg', 'image/png'].includes(image.mimetype)) return { valid: false, message: 'Image must be JPEG or PNG' };
  if (image && image.size > 5 * 1024 * 1024) return { valid: false, message: 'Image must be under 5MB' };
  if (cv && cv.mimetype !== 'application/pdf') return { valid: false, message: 'CV must be a PDF' };
  if (cv && cv.size > 10 * 1024 * 1024) return { valid: false, message: 'CV must be under 10MB' };
  if (portfolio && portfolio.mimetype !== 'application/pdf') return { valid: false, message: 'Portfolio must be a PDF' };
  return { valid: true };
};

const generatePortfolio = async (req, res) => {
  try {
    // Validate input
    const validation = validatePortfolio(req);
    if (!validation.valid) return res.status(400).json({ message: validation.message });

    const { name, email, profession, tagline, summary, about, phone, linkedin, template } = req.body;
    let skills, projects;
    try {
      skills = JSON.parse(req.body.skills || '[]');
      projects = JSON.parse(req.body.projects || '[]');
    } catch (e) {
      return res.status(400).json({ message: 'Invalid skills or projects format' });
    }

    const { image, cv, portfolio } = req.files || {};

    // Save metadata to Supabase
    const { data, error } = await supabase
      .from('portfolios')
      .insert({
        name, email, profession, tagline, summary, about, phone, linkedin, template, skills, projects,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error.message);
      return res.status(500).json({ message: 'Failed to save portfolio metadata' });
    }

    const portfolioId = data.id;
    const filePaths = {};

    // Upload files to Supabase Storage
    if (image) {
      const { error: imageError } = await supabase.storage
        .from('portfolio-files')
        .upload(`images/${portfolioId}/${image.name}`, image.data, { contentType: image.mimetype });
      if (imageError) {
        console.error('Image upload error:', imageError.message);
        return res.status(500).json({ message: 'Failed to upload image' });
      }
      filePaths.image = `${process.env.SUPABASE_URL}/storage/v1/object/public/portfolio-files/images/${portfolioId}/${image.name}`;
    }

    if (cv) {
      const { error: cvError } = await supabase.storage
        .from('portfolio-files')
        .upload(`cvs/${portfolioId}/${cv.name}`, cv.data, { contentType: cv.mimetype });
      if (cvError) {
        console.error('CV upload error:', cvError.message);
        return res.status(500).json({ message: 'Failed to upload CV' });
      }
      filePaths.cv = `${process.env.SUPABASE_URL}/storage/v1/object/public/portfolio-files/cvs/${portfolioId}/${cv.name}`;
    }

    // Upload PDF to GitHub
    let portfolioUrl = '';
    if (portfolio) {
      const path = `portfolios/${portfolioId}/portfolio.pdf`;
      try {
        const response = await octokit.repos.createOrUpdateFileContents({
          owner: process.env.GITHUB_OWNER,
          repo: process.env.GITHUB_REPO,
          path,
          message: `Portfolio for ${name}`,
          content: Buffer.from(portfolio.data).toString('base64')
        });
        portfolioUrl = response.data.content.download_url;
      } catch (githubError) {
        console.error('GitHub upload error:', githubError.message);
        return res.status(500).json({ message: 'Failed to upload portfolio to GitHub' });
      }
    }

    // Update portfolio with file URLs
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({ image_url: filePaths.image, cv_url: filePaths.cv, portfolio_url })
      .eq('id', portfolioId);

    if (updateError) {
      console.error('Supabase update error:', updateError.message);
      return res.status(500).json({ message: 'Failed to update portfolio URLs' });
    }

    res.status(200).json({ portfolio_url });
  } catch (error) {
    console.error('Portfolio generation error:', error.message, error.stack);
    res.status(500).json({ message: 'Failed to generate portfolio' });
  }
};

module.exports = generatePortfolio;
