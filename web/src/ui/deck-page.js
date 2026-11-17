// The deck guide pages (/decks/<genre>): a Copy button next to each deck code. Without the clipboard API
// the button stays hidden and the code is still there to select by hand.

if (navigator.clipboard) {
  // The button's own label change isn't read out by screen readers, so the result is also said here.
  const status = document.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  document.body.append(status);

  for (const button of document.querySelectorAll('.copy-code')) {
    const code = button.parentElement.querySelector('code').textContent;
    let reset = 0;
    button.hidden = false;
    button.addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        button.textContent = 'Copied';
        status.textContent = 'Deck code copied.';
      }, () => {
        button.textContent = 'Select and copy';
        status.textContent = 'Couldn’t copy. Select the deck code and copy it by hand.';
      });
      clearTimeout(reset);
      reset = setTimeout(() => { button.textContent = 'Copy'; status.textContent = ''; }, 1500);
    });
  }
}
