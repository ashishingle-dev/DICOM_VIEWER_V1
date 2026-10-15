using System.Security.Cryptography;
using System.Text;

namespace DicomViewer.Application.Services;

/// <summary>Refresh tokens are stored and looked up by SHA-256 hash, never in plaintext.</summary>
public static class TokenHash
{
    public static string Of(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
