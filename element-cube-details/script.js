const elementsGrid = document.querySelector('.elements-grid');
const elements     = document.querySelectorAll('.element');
const indicators   = document.querySelectorAll('.element-indicator');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const sym = entry.target.dataset.symbol;
      indicators.forEach(ind => {
        ind.classList.toggle('active', ind.textContent === sym);
      });
    }
  });
}, { root: elementsGrid, threshold: 0.6 });

elements.forEach(el => observer.observe(el));

indicators.forEach(indicator => {
  indicator.addEventListener('click', () => {
    const sym = indicator.textContent;
    const target = document.querySelector(`.element[data-symbol="${sym}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
});
