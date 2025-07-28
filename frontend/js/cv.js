try {
  const { createElement } = React;
  const { createRoot } = ReactDOM;

  const App = () => {
    return createElement(
      "div",
      { className: "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16" },
      createElement("h1", { className: "text-3xl font-poppins font-bold text-gray-800 mb-8 text-center" }, "Create Your CV"),
      createElement("p", { className: "text-lg text-gray-600 text-center" }, "Simplified React test page for cv.html")
    );
  };

  const root = createRoot(document.getElementById('root'));
  root.render(createElement(App));
} catch (error) {
  console.error('Error in cv.js:', error.message, error.stack);
  const errorDiv = document.getElementById('error');
  errorDiv.className = 'error-message error';
  document.getElementById('error-text').innerText = `Error: ${error.message} (Check console for details)`;
}
