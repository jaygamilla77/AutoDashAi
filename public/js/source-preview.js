/**
 * Source preview client-side interactions
 */

document.addEventListener('DOMContentLoaded', function () {
  // Highlight active source type rows
  const rows = document.querySelectorAll('.schema-role-measure');
  rows.forEach(function (row) {
    row.style.fontWeight = '600';
  });
});
