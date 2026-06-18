namespace MetaDeck.Diagnostics
{
    /// <summary>
    /// Logging abstraction so the pure engine has no Unity dependency. Unity injects a
    /// UnityEngine.Debug-backed logger; the standalone server injects a console logger.
    /// </summary>
    public interface IGameLogger
    {
        void Log(string message);
        void Warn(string message);
    }

    /// <summary>
    /// Static facade the engine logs through. Set <see cref="Logger"/> once at startup.
    /// <see cref="Debug"/> messages are gated by <see cref="Verbose"/> (off by default) to keep
    /// the console/server output quiet; <see cref="Info"/>/<see cref="Warn"/> always pass through.
    /// </summary>
    public static class GameLog
    {
        public static IGameLogger Logger { get; set; }
        public static bool Verbose { get; set; } = false;

        public static void Info(string message) => Logger?.Log(message);
        public static void Warn(string message) => Logger?.Warn(message);

        public static void Debug(string message)
        {
            if (Verbose) Logger?.Log(message);
        }
    }
}
