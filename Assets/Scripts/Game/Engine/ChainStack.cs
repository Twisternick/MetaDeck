using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Effects;
using MetaDeck.Rules;

namespace MetaDeck.Events
{
    public sealed class ChainItem
    {
        public CardInstance Source { get; private set; }
        public IEffect Effect { get; private set; }
        public TargetSpec Target { get; private set; }
        public PlayerId Activator { get; private set; } // who added this to chain

        public ChainItem(CardInstance source, IEffect effect, TargetSpec target, PlayerId activator)
        {
            Source = source;
            Effect = effect;
            Target = target;
            Activator = activator;
        }
    }

    public sealed class ChainStack
    {
        private readonly Stack<ChainItem> _stack;

        public ChainStack()
        {
            _stack = new Stack<ChainItem>();
        }

        public int Count { get { return _stack.Count; } }

        public void Push(ChainItem item)
        {
            _stack.Push(item);
        }

        public ChainItem Pop()
        {
            return _stack.Pop();
        }

        public ChainItem Peek()
        {
            return _stack.Peek();
        }

        public void Clear()
        {
            _stack.Clear();
        }
    }

    /// <summary>
    /// Wrapper around a target object.
    /// Target may be: CardInstance, PlayerId, or null.
    /// (We avoid nullable reference syntax for max Unity compatibility.)
    /// </summary>
    public struct TargetSpec
    {
        public object Target { get; private set; }

        public TargetSpec(object target)
        {
            Target = target;
        }

        public static TargetSpec None()
        {
            return new TargetSpec(null);
        }
    }
}