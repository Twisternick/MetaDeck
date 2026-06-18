using UnityEngine;
using MetaDeck.Presentation;

public abstract class DropZone3D : MonoBehaviour
{
    public abstract bool CanDrop(CardView3D cardInstance);
    public abstract void OnDrop(CardView3D cardInstance);
}