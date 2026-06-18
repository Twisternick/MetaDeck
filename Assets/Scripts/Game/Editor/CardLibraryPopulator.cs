#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using MetaDeck.Data;
using MetaDeck.Unity;

namespace MetaDeck.EditorTools
{
    /// <summary>
    /// Fills the open scene's CardLibraryMB with every CardDefinition in the project, so you don't
    /// have to drag them in by hand. Run after adding/removing cards. Menu: MetaDeck → Populate Card Library.
    /// The references are saved into the scene (so they work in builds too) — remember to save the scene.
    /// </summary>
    public static class CardLibraryPopulator
    {
        [MenuItem("MetaDeck/Populate Card Library (Scene)")]
        public static void Populate()
        {
            var lib = Object.FindFirstObjectByType<CardLibraryMB>();
            if (lib == null)
            {
                Debug.LogError("[MetaDeck] No CardLibraryMB found in the open scene. Add one to a GameObject first.");
                return;
            }

            var cards = new List<CardDefinition>();
            foreach (var guid in AssetDatabase.FindAssets("t:CardDefinition"))
            {
                var card = AssetDatabase.LoadAssetAtPath<CardDefinition>(AssetDatabase.GUIDToAssetPath(guid));
                if (card != null) cards.Add(card);
            }

            // Write into the private [SerializeField] List<CardDefinition> cards via SerializedObject.
            var so = new SerializedObject(lib);
            var prop = so.FindProperty("cards");
            prop.ClearArray();
            for (int i = 0; i < cards.Count; i++)
            {
                prop.InsertArrayElementAtIndex(i);
                prop.GetArrayElementAtIndex(i).objectReferenceValue = cards[i];
            }
            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(lib);

            Debug.Log($"[MetaDeck] Populated CardLibraryMB with {cards.Count} cards. Save the scene to keep it.");
        }
    }
}
#endif
