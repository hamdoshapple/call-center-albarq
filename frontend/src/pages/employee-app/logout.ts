export default async function employeeLogout() {
  const token = localStorage.getItem('cc_token') || localStorage.getItem('token') || '';

  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => null);

  localStorage.removeItem('cc_token');
  localStorage.removeItem('token');
  localStorage.removeItem('employee_token');
  sessionStorage.clear();

  window.location.replace('/employee/login');
}
