using System;
using System.Collections.Generic;
using MetaDeck.Rules;

namespace MetaDeck.Core
{
    public sealed class PendingTrigger
    {
        public string Id { get; }
        public PlayerId Controller { get; }
        public string SourceInstanceId { get; }
        public SimpleTargeting Targeting { get; }   // what kind of target is required

        public PendingTrigger(string id, PlayerId controller, string sourceInstanceId, Keyword keyword, SimpleTargeting targeting)
        {
            Id = id;
            Controller = controller;
            SourceInstanceId = sourceInstanceId;
            Targeting = targeting;
        }
    }

    public sealed partial class GameState
    {
        public List<PendingTrigger> PendingTriggers { get; } = new();
    }
}