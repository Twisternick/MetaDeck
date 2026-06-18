using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace MetaDeck.Server
{
    public static class WsUtil
    {
        /// <summary>Receive one complete text message, or null if the socket closed.</summary>
        public static async Task<string> ReceiveText(WebSocket ws, CancellationToken ct)
        {
            var buffer = new byte[8192];
            using var ms = new MemoryStream();
            while (true)
            {
                WebSocketReceiveResult r;
                try { r = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct); }
                catch (WebSocketException) { return null; }
                catch (OperationCanceledException) { return null; }

                if (r.MessageType == WebSocketMessageType.Close) return null;
                ms.Write(buffer, 0, r.Count);
                if (r.EndOfMessage) break;
            }
            return Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
        }

        public static Task SendText(WebSocket ws, string text, CancellationToken ct)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            return ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct);
        }
    }
}
