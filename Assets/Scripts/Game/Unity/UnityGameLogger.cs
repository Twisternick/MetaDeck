using UnityEngine;
using MetaDeck.Diagnostics;

namespace MetaDeck.Unity
{
    /// <summary>Routes engine logs to the Unity console. Lives in the Unity assembly (not the pure engine).</summary>
    public sealed class UnityGameLogger : IGameLogger
    {
        public void Log(string message) => Debug.Log(message);
        public void Warn(string message) => Debug.LogWarning(message);
    }
}
