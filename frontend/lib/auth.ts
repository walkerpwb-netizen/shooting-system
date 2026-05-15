export function getUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const roles = getStoredRoles();
  const email = localStorage.getItem("email");

  if (!token) {
    return null;
  }

  return {
    token,
    role,
    roles,
    email,
  };
}

export function getStoredRoles() {
  if (typeof window === "undefined") {
    return [];
  }

  const roles = localStorage.getItem("roles");

  if (roles) {
    return roles
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
  }

  const role = localStorage.getItem("role");

  return role
    ? [role]
    : [];
}

export function isLoggedIn() {
  return !!getUser();
}

export function isAdmin() {
  return getUser()?.roles.includes("admin");
}

export function isOrganizer() {
  const roles = getUser()?.roles || [];

  return roles.includes("organizer") || roles.includes("admin");
}

export function isJudge() {
  const roles = getUser()?.roles || [];

  return roles.includes("judge");
}
