using System;
using System.IO;
using UnityEditor;
using UnityEngine;

using MetaDeck.Data;
using MetaDeck.Rules;

namespace MetaDeck.EditorTools
{
    public static class MetaDeckCardJsonBatchImporter
    {
        [Serializable]
        private class CardListWrapper
        {
            public CardImport[] cards;
        }

        [Serializable]
        private class CardImport
        {
            public string cardId;
            public string displayName;

            public string type;        // "Monster", "Spell"
            public int cost;

            public int baseAttack;
            public int baseHealth;

            public string speedWindow; // "None", "Quick"
            public string[] keywords;

            // Optional fields (safe to ignore if not present)
            public int startingNitro;

            public EffectImport[] effects;
            public string[] archetypes;
        }

        [Serializable]
        private class EffectImport
        {
            public string effectType;
            public int amount;
            public string targeting;
            public string condition;

            // If you added keyword to EffectDefinition + importer support:
            public string keyword;
        }

        /// <summary>
        /// Import all JSON files found under Assets/Cards recursively.
        /// JSON files are expected to live inside each archetype folder:
        /// Assets/Cards/<Archetype>/<file>.json
        /// ScriptableObjects are created in the same folder as the JSON file.
        /// </summary>
        [MenuItem("MetaDeck/Import Cards/Import ALL JSON Under Assets/Cards")]
        public static void ImportAllUnderCardsFolder()
        {
            bool overwrite = EditorUtility.DisplayDialog(
                "Overwrite Existing?",
                "Do you want to overwrite existing CardDefinition assets with the same filename/cardId?\n\nYes = overwrite\nNo = skip existing",
                "Yes (Overwrite)",
                "No (Skip)"
            );

            ImportAllJson("Assets/Cards", overwrite);
        }

        /// <summary>
        /// Core batch import method. You can call this from other tools as well.
        /// </summary>
        public static void ImportAllJson(string rootFolder, bool overwriteExisting)
        {
            if (!AssetDatabase.IsValidFolder(rootFolder))
            {
                Debug.LogError("Folder not found: " + rootFolder);
                return;
            }

            string[] guids = AssetDatabase.FindAssets("t:TextAsset", new[] { rootFolder });

            int jsonFilesFound = 0;
            int created = 0;
            int updated = 0;
            int skipped = 0;
            int parseFailed = 0;

            AssetDatabase.StartAssetEditing();
            try
            {
                for (int i = 0; i < guids.Length; i++)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guids[i]);
                    if (!path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                        continue;

                    jsonFilesFound++;

                    TextAsset jsonAsset = AssetDatabase.LoadAssetAtPath<TextAsset>(path);
                    if (jsonAsset == null)
                    {
                        Debug.LogWarning("Could not load JSON TextAsset: " + path);
                        continue;
                    }

                    string jsonText = jsonAsset.text;
                    CardListWrapper wrapper = TryParseWrapper(jsonText);
                    if (wrapper == null || wrapper.cards == null || wrapper.cards.Length == 0)
                    {
                        parseFailed++;
                        Debug.LogError("Failed to parse JSON: " + path);
                        continue;
                    }

                    string outputFolder = Path.GetDirectoryName(path).Replace("\\", "/");
                    if (!AssetDatabase.IsValidFolder(outputFolder))
                    {
                        parseFailed++;
                        Debug.LogError("Output folder invalid (from JSON path): " + outputFolder);
                        continue;
                    }

                    // Import every card in this JSON into the same folder
                    for (int c = 0; c < wrapper.cards.Length; c++)
                    {
                        CardImport ci = wrapper.cards[c];
                        if (ci == null || string.IsNullOrWhiteSpace(ci.cardId))
                        {
                            skipped++;
                            continue;
                        }

                        string assetName = SanitizeFileName(ci.cardId);
                        string assetPath = outputFolder.TrimEnd('/') + "/" + assetName + ".asset";

                        CardDefinition asset = AssetDatabase.LoadAssetAtPath<CardDefinition>(assetPath);

                        if (asset != null && !overwriteExisting)
                        {
                            skipped++;
                            continue;
                        }

                        bool isNew = false;
                        if (asset == null)
                        {
                            asset = ScriptableObject.CreateInstance<CardDefinition>();
                            AssetDatabase.CreateAsset(asset, assetPath);
                            isNew = true;
                        }

                        ApplyToAsset(asset, ci);
                        EditorUtility.SetDirty(asset);

                        if (isNew) created++;
                        else updated++;
                    }
                }
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }

            Debug.Log(
                "Batch import complete.\n" +
                "Root: " + rootFolder + "\n" +
                "JSON files found: " + jsonFilesFound + "\n" +
                "Created: " + created + ", Updated: " + updated + ", Skipped: " + skipped + ", Parse failed: " + parseFailed
            );
        }

        // -------------------------
        // Parsing / Application
        // -------------------------

        private static CardListWrapper TryParseWrapper(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;

            json = json.Trim();

            try
            {
                if (json.StartsWith("["))
                {
                    string wrapped = "{ \"cards\": " + json + " }";
                    return JsonUtility.FromJson<CardListWrapper>(wrapped);
                }

                return JsonUtility.FromJson<CardListWrapper>(json);
            }
            catch (Exception ex)
            {
                Debug.LogError("JSON parse error: " + ex.Message);
                return null;
            }
        }

        private static void ApplyToAsset(CardDefinition asset, CardImport ci)
        {
            SerializedObject so = new SerializedObject(asset);

            SetString(so, "cardId", ci.cardId);
            SetString(so, "displayName", ci.displayName);

            CardType parsedType = ParseEnum(ci.type, CardType.Monster);
            SetEnum(so, "type", (int)parsedType);

            SetInt(so, "cost", ci.cost);
            SetInt(so, "baseAttack", ci.baseAttack);
            SetInt(so, "baseHealth", ci.baseHealth);

            SpeedWindow parsedSpeed = ParseEnum(ci.speedWindow, SpeedWindow.None);
            SetEnum(so, "speedWindow", (int)parsedSpeed);

            SetKeywordArray(so, "keywords", ci.keywords);
            SetStringArray(so, "archetypes", ci.archetypes);
            SetEffectsArray(so, "effects", ci.effects);

            // Optional: startingNitro on CardDefinition (if exists)
            SerializedProperty nitroProp = so.FindProperty("startingNitro");
            if (nitroProp != null && nitroProp.propertyType == SerializedPropertyType.Integer)
                nitroProp.intValue = ci.startingNitro;

            so.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetEffectsArray(SerializedObject so, string propName, EffectImport[] effects)
        {
            SerializedProperty p = so.FindProperty(propName);
            if (p == null || !p.isArray) return;

            int count = (effects != null) ? effects.Length : 0;
            p.arraySize = count;

            for (int i = 0; i < count; i++)
            {
                EffectImport e = effects[i];
                SerializedProperty element = p.GetArrayElementAtIndex(i);

                SerializedProperty effectTypeProp = element.FindPropertyRelative("effectType");
                SerializedProperty amountProp = element.FindPropertyRelative("amount");
                SerializedProperty targetingProp = element.FindPropertyRelative("targeting");
                SerializedProperty conditionProp = element.FindPropertyRelative("condition");

                if (amountProp != null) amountProp.intValue = (e != null) ? e.amount : 0;

                if (effectTypeProp != null)
                {
                    int idx = EnumIndexOrDefault<MetaDeck.Rules.EffectType>(e != null ? e.effectType : null, 0);
                    effectTypeProp.enumValueIndex = idx;
                }

                if (targetingProp != null)
                {
                    int idx = EnumIndexOrDefault<SimpleTargeting>(e != null ? e.targeting : null, 0);
                    targetingProp.enumValueIndex = idx;
                }

                if (conditionProp != null)
                {
                    int idx = EnumIndexOrDefault<MetaDeck.Data.SimpleCondition>(e != null ? e.condition : null, 0);
                    conditionProp.enumValueIndex = idx;
                }

                // Optional: keyword field inside EffectDefinition (if exists)
                SerializedProperty keywordProp = element.FindPropertyRelative("keyword");
                if (keywordProp != null)
                {
                    int idx = EnumIndexOrDefault<Keyword>(e != null ? e.keyword : null, 0);
                    keywordProp.enumValueIndex = idx;
                }
            }
        }

        private static void SetKeywordArray(SerializedObject so, string propName, string[] keywords)
        {
            SerializedProperty p = so.FindProperty(propName);
            if (p == null || !p.isArray) return;

            int count = (keywords != null) ? keywords.Length : 0;
            p.arraySize = count;

            for (int i = 0; i < count; i++)
            {
                SerializedProperty el = p.GetArrayElementAtIndex(i);
                int idx = EnumIndexOrDefault<Keyword>(keywords[i], 0);
                el.enumValueIndex = idx;
            }
        }

        private static void SetStringArray(SerializedObject so, string propName, string[] values)
        {
            SerializedProperty p = so.FindProperty(propName);
            if (p == null || !p.isArray) return;

            int count = (values != null) ? values.Length : 0;
            p.arraySize = count;

            for (int i = 0; i < count; i++)
            {
                SerializedProperty el = p.GetArrayElementAtIndex(i);
                el.stringValue = values[i] ?? "";
            }
        }

        private static void SetString(SerializedObject so, string propName, string value)
        {
            SerializedProperty p = so.FindProperty(propName);
            if (p != null) p.stringValue = value ?? "";
        }

        private static void SetInt(SerializedObject so, string propName, int value)
        {
            SerializedProperty p = so.FindProperty(propName);
            if (p != null) p.intValue = value;
        }

        private static void SetEnum(SerializedObject so, string propName, int enumIndex)
        {
            SerializedProperty p = so.FindProperty(propName);
            if (p != null) p.enumValueIndex = enumIndex;
        }

        private static TEnum ParseEnum<TEnum>(string raw, TEnum fallback) where TEnum : struct
        {
            if (string.IsNullOrWhiteSpace(raw)) return fallback;

            TEnum parsed;
            if (Enum.TryParse(raw, true, out parsed))
                return parsed;

            return fallback;
        }

        private static int EnumIndexOrDefault<TEnum>(string raw, int fallbackIndex) where TEnum : struct
        {
            if (string.IsNullOrWhiteSpace(raw)) return fallbackIndex;

            TEnum parsed;
            if (Enum.TryParse(raw, true, out parsed))
            {
                string[] names = Enum.GetNames(typeof(TEnum));
                string name = parsed.ToString();
                for (int i = 0; i < names.Length; i++)
                    if (string.Equals(names[i], name, StringComparison.Ordinal))
                        return i;
            }
            return fallbackIndex;
        }

        private static string SanitizeFileName(string name)
        {
            char[] invalid = Path.GetInvalidFileNameChars();
            for (int i = 0; i < invalid.Length; i++)
                name = name.Replace(invalid[i].ToString(), "_");
            return name;
        }
    }
}