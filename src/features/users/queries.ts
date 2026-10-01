export function userDisplayName(user: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || user.email;
}
