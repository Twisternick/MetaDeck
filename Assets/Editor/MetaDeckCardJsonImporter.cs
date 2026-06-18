using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

using MetaDeck.Data;
using MetaDeck.Rules;
using Microsoft.SqlServer.Server;

namespace MetaDeck.EditorTools
{
    public sealed class MetaDeckCardJsonImporter : EditorWindow
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

            public string type;        // "Monster", "Spell", "Trap"
            public int cost;

            public int baseAttack;
            public int baseHealth;

            public string speedWindow; // "None", "Quick"

            public string[] keywords;  // ["Rush", ...]
            public int startingNitro;  // optional

            public EffectImport[] effects;
            public string[] archetypes;
        }

        [Serializable]
        private class EffectImport
        {
            public string effectType;  // "Draw", "DealDamage", etc.
            public int amount;
            public string targeting;   // "EnemyMonster", etc.
            public string condition;   // "None", etc.

            public string keyword;     // "Rush", "FirstStrike", etc.
        }

        private TextAsset _jsonFile;
        private string _jsonText;
        private DefaultAsset _outputFolder;
        private bool _overwriteExisting = false;

        [MenuItem("MetaDeck/Import Cards From JSON")]
        public static void Open()
        {
            GetWindow<MetaDeckCardJsonImporter>("MetaDeck JSON Importer");
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("MetaDeck Card Importer", EditorStyles.boldLabel);
            EditorGUILayout.Space(6);

            _outputFolder = (DefaultAsset)EditorGUILayout.ObjectField(
                "Output Folder",
                _outputFolder,
                typeof(DefaultAsset),
                false
            );

            _overwriteExisting = EditorGUILayout.Toggle("Overwrite Existing", _overwriteExisting);

            EditorGUILayout.Space(10);
            EditorGUILayout.LabelField("Option A: Import from TextAsset", EditorStyles.boldLabel);
            _jsonFile = (TextAsset)EditorGUILayout.ObjectField("JSON File", _jsonFile, typeof(TextAsset), false);

            if (GUILayout.Button("Load JSON from TextAsset") && _jsonFile != null)
            {
                _jsonText = _jsonFile.text;
            }

            EditorGUILayout.Space(10);
            EditorGUILayout.LabelField("Option B: Paste JSON", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Paste a JSON ARRAY of cards, or a WRAPPED object { \"cards\": [...] }", MessageType.Info);

            _jsonText = EditorGUILayout.TextArea(_jsonText, GUILayout.MinHeight(160));

            EditorGUILayout.Space(10);

            using (new EditorGUI.DisabledScope(string.IsNullOrWhiteSpace(_jsonText)))
            {
                if (GUILayout.Button("Import Cards"))
                {
                    Import();
                }
            }
        }

        private void Import()
        {
            string folderPath = "Assets";
            if (_outputFolder != null)
            {
                folderPath = AssetDatabase.GetAssetPath(_outputFolder);
                if (!AssetDatabase.IsValidFolder(folderPath))
                {
                    Debug.LogError("Output folder is invalid. Defaulting to Assets/");
                    folderPath = "Assets";
                }
            }

            // Allow either:
            // 1) JSON array: [ {...}, {...} ]
            // 2) Wrapped: { "cards": [ ... ] }
            var wrapper = TryParseWrapper(_jsonText);
            if (wrapper == null || wrapper.cards == null || wrapper.cards.Length == 0)
            {
                Debug.LogError("Failed to parse JSON. Ensure it is either an array [ ... ] or { \"cards\": [ ... ] }.");
                return;
            }

            int created = 0;
            int updated = 0;
            int skipped = 0;

            AssetDatabase.StartAssetEditing();
            try
            {
                for (int i = 0; i < wrapper.cards.Length; i++)
                {
                    var ci = wrapper.cards[i];
                    if (ci == null || string.IsNullOrWhiteSpace(ci.cardId))
                    {
                        skipped++;
                        continue;
                    }

                    string safeName = SanitizeFileName(ci.cardId);
                    string assetPath = folderPath.TrimEnd('/') + "/" + safeName + ".asset";

                    CardDefinition asset = AssetDatabase.LoadAssetAtPath<CardDefinition>(assetPath);

                    if (asset != null && !_overwriteExisting)
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
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }

            Debug.Log(string.Format(
                "Import complete. Created: {0}, Updated: {1}, Skipped: {2}",
                created, updated, skipped
            ));
        }

        private static CardListWrapper TryParseWrapper(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;

            json = json.Trim();

            try
            {
                // If it looks like an array, wrap it.
                if (json.StartsWith("["))
                {
                    string wrapped = "{ \"cards\": " + json + " }";
                    return JsonUtility.FromJson<CardListWrapper>(wrapped);
                }

                // Otherwise assume { "cards": [...] }
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
            // We set via SerializedObject so we can set optional fields like startingNitro safely
            var so = new SerializedObject(asset);

            SetString(so, "cardId", ci.cardId);
            SetString(so, "displayName", ci.displayName);

            // type
            CardType parsedType = ParseEnum(ci.type, CardType.Monster);
            SetEnum(so, "type", (int)parsedType);

            SetInt(so, "cost", ci.cost);
            SetInt(so, "baseAttack", ci.baseAttack);
            SetInt(so, "baseHealth", ci.baseHealth);

            // speedWindow
            SpeedWindow parsedSpeed = ParseEnum(ci.speedWindow, SpeedWindow.None);
            SetEnum(so, "speedWindow", (int)parsedSpeed);

            // keywords[]
            SetKeywordArray(so, "keywords", ci.keywords);

            // archetypes[]
            SetStringArray(so, "archetypes", ci.archetypes);

            // effects[]
            SetEffectsArray(so, "effects", ci.effects);

            // optional: startingNitro (only if field exists on CardDefinition)
            // This avoids compile errors if you haven't added it yet.
            var nitroProp = so.FindProperty("startingNitro");
            if (nitroProp != null && nitroProp.propertyType == SerializedPropertyType.Integer)
            {
                nitroProp.intValue = ci.startingNitro;
            }

            so.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void SetEffectsArray(SerializedObject so, string propName, EffectImport[] effects)
        {
            var p = so.FindProperty(propName);
            if (p == null || !p.isArray) return;

            int count = effects != null ? effects.Length : 0;
            p.arraySize = count;

            for (int i = 0; i < count; i++)
            {
                var e = effects[i];
                var element = p.GetArrayElementAtIndex(i);

                // EffectDefinition has fields:
                // effectType (enum), amount (int), targeting (enum), condition (enum)
                var effectTypeProp = element.FindPropertyRelative("effectType");
                var amountProp = element.FindPropertyRelative("amount");
                var targetingProp = element.FindPropertyRelative("targeting");
                var conditionProp = element.FindPropertyRelative("condition");

                var keywordProp = element.FindPropertyRelative("keyword");
                if (keywordProp != null)
                {
                    int idx = EnumIndexOrDefault<MetaDeck.Rules.Keyword>(e != null ? e.keyword : null, 0);
                    keywordProp.enumValueIndex = idx;
                }

                if (amountProp != null) amountProp.intValue = e != null ? e.amount : 0;

                // Enums are stored as int indices in SerializedProperty for Unity
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
            }
        }

        private static void SetKeywordArray(SerializedObject so, string propName, string[] keywords)
        {
            var p = so.FindProperty(propName);
            if (p == null || !p.isArray) return;

            int count = keywords != null ? keywords.Length : 0;
            p.arraySize = count;

            for (int i = 0; i < count; i++)
            {
                var el = p.GetArrayElementAtIndex(i);
                int idx = EnumIndexOrDefault<Keyword>(keywords[i], 0);
                el.enumValueIndex = idx;
            }
        }

        private static void SetStringArray(SerializedObject so, string propName, string[] values)
        {
            var p = so.FindProperty(propName);
            if (p == null || !p.isArray) return;

            int count = values != null ? values.Length : 0;
            p.arraySize = count;

            for (int i = 0; i < count; i++)
            {
                var el = p.GetArrayElementAtIndex(i);
                el.stringValue = values[i] ?? "";
            }
        }

        private static void SetString(SerializedObject so, string propName, string value)
        {
            var p = so.FindProperty(propName);
            if (p != null) p.stringValue = value ?? "";
        }

        private static void SetInt(SerializedObject so, string propName, int value)
        {
            var p = so.FindProperty(propName);
            if (p != null) p.intValue = value;
        }

        private static void SetEnum(SerializedObject so, string propName, int enumIndex)
        {
            var p = so.FindProperty(propName);
            if (p != null) p.enumValueIndex = enumIndex;
        }

        private static TEnum ParseEnum<TEnum>(string raw, TEnum fallback) where TEnum : struct
        {
            if (string.IsNullOrWhiteSpace(raw)) return fallback;

            TEnum parsed;
            if (Enum.TryParse<TEnum>(raw, true, out parsed))
                return parsed;

            return fallback;
        }

        private static int EnumIndexOrDefault<TEnum>(string raw, int fallbackIndex) where TEnum : struct
        {
            if (string.IsNullOrWhiteSpace(raw)) return fallbackIndex;

            TEnum parsed;
            if (Enum.TryParse<TEnum>(raw, true, out parsed))
            {
                // Unity stores enums by index into names array
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
            foreach (char c in Path.GetInvalidFileNameChars())
                name = name.Replace(c.ToString(), "_");
            return name;
        }
    }
}