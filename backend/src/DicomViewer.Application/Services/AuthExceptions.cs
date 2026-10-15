namespace DicomViewer.Application.Services;

/// <summary>Input failed validation (username format, password policy, unknown role).</summary>
public sealed class AuthValidationException(string message) : Exception(message);

/// <summary>The requested username already exists.</summary>
public sealed class UsernameTakenException(string username)
    : Exception($"The username '{username}' is already in use.");

/// <summary>The current password supplied to a password change was wrong.</summary>
public sealed class IncorrectPasswordException() : Exception("Current password is incorrect.");

/// <summary>The account is temporarily locked after repeated failed sign-in attempts.</summary>
public sealed class AccountLockedException() : Exception("Account is temporarily locked.");
