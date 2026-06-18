using UnityEngine;
using UnityEngine.InputSystem;

public sealed class HandScrollInput : MonoBehaviour
{
    [SerializeField] private HandLayout3D layout;
    [SerializeField] private InputActionReference scrollAction;

    private void OnEnable() => scrollAction.action.Enable();
    private void OnDisable() => scrollAction.action.Disable();

    private void Update()
    {
        Vector2 scroll = scrollAction.action.ReadValue<Vector2>();
        if (Mathf.Abs(scroll.y) > 0.01f)
            layout.AddScrollDelta(scroll.y);
    }
}