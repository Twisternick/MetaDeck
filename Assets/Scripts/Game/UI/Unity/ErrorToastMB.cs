using TMPro;
using UnityEngine;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Shows server rejections / errors (MetaDeckNetClientMB.OnError) as a brief on-screen toast,
    /// so the player understands why an action didn't happen (e.g. "Not your turn", "Not enough Bandwidth").
    /// </summary>
    public sealed class ErrorToastMB : MonoBehaviour
    {
        [SerializeField] private MetaDeckNetClientMB netClient;
        [SerializeField] private GameObject toastRoot;
        [SerializeField] private TMP_Text toastText;
        [SerializeField] private float seconds = 3f;

        private float _hideAt = -1f;

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
            if (toastRoot != null) toastRoot.SetActive(false);
        }

        private void OnEnable() { if (netClient != null) netClient.OnError += Show; }
        private void OnDisable() { if (netClient != null) netClient.OnError -= Show; }

        private void Show(string message)
        {
            if (toastText != null) toastText.text = message;
            if (toastRoot != null) toastRoot.SetActive(true);
            _hideAt = Time.time + seconds;
        }

        private void Update()
        {
            if (toastRoot != null && toastRoot.activeSelf && Time.time >= _hideAt)
                toastRoot.SetActive(false);
        }
    }
}
