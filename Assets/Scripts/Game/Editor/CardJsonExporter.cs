#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using MetaDeck.Data;
using MetaDeck.Protocol;

namespace MetaDeck.EditorTools
{
    /// <summary>
    /// Exports every <see cref="CardDefinition"/> asset in the project to the standalone server's
    /// card database (cards.json), using the same wire serialization the server reads. Run this
    /// whenever you add/change cards, then restart the server. Menu: MetaDeck → Export Cards to Server.
    /// </summary>
    public static class CardJsonExporter
    {
        [MenuItem("MetaDeck/Export Cards to Server")]
        public static void Export()
        {
            var defs = new List<CardDef>();
            var seen = new HashSet<string>();
            int duplicates = 0;

            foreach (var guid in AssetDatabase.FindAssets("t:CardDefinition"))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var card = AssetDatabase.LoadAssetAtPath<CardDefinition>(path);
                if (card == null || string.IsNullOrEmpty(card.cardId)) continue;

                if (!seen.Add(card.cardId)) { duplicates++; Debug.LogWarning($"[MetaDeck] Duplicate cardId '{card.cardId}' at {path}"); }
                defs.Add(card.ToCardDef());
            }

            // Default to <project>/server/MetaDeck.Server/cards.json; let the user redirect if it's elsewhere.
            var defaultPath = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "server", "MetaDeck.Server", "cards.json"));
            var outPath = defaultPath;
            if (!Directory.Exists(Path.GetDirectoryName(defaultPath)))
            {
                outPath = EditorUtility.SaveFilePanel("Export cards.json", Application.dataPath, "cards.json", "json");
                if (string.IsNullOrEmpty(outPath)) return; // cancelled
            }

            File.WriteAllText(outPath, ProtocolJson.Serialize(defs));
            Debug.Log($"[MetaDeck] Exported {defs.Count} cards ({duplicates} duplicate id(s)) to {outPath}");
            AssetDatabase.Refresh();
        }
    }
}
#endif
