using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace MetaDeck.Protocol
{
    /// <summary>
    /// JSON (de)serialization for the wire protocol. Newtonsoft works on both the .NET server and the
    /// Unity client (via com.unity.nuget.newtonsoft-json). Enums are written as strings for readability
    /// and forward-compat; null fields are omitted to keep messages small.
    /// </summary>
    public static class ProtocolJson
    {
        private static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            Formatting = Formatting.None,
            Converters = { new StringEnumConverter() }
        };

        public static string Serialize(object value) => JsonConvert.SerializeObject(value, Settings);

        public static T Deserialize<T>(string json) => JsonConvert.DeserializeObject<T>(json, Settings);
    }
}
