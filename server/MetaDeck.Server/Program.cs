using System;
using System.Threading;
using System.Threading.Tasks;
using MetaDeck.Server;

if (args.Length > 0 && args[0] == "selftest")
    return await SelfTest.Run();

const string prefix = "http://localhost:8123/";
var cards = CardCatalog.Load("cards.json");

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

Console.WriteLine($"MetaDeck server listening on {prefix}  ({cards.Count} cards). Ctrl+C to stop.");
var server = new MatchServer(prefix, cards);
await server.RunAsync(cts.Token);
return 0;
