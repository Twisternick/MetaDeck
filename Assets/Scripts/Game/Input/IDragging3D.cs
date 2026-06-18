using UnityEngine;
public interface IDraggable3D
{
    void BeginDrag(Vector3 worldPoint, Vector3 pointerOffset);
    void DragTo(Vector3 worldPoint);
    void EndDrag(bool droppedOnZone, DropZone3D zone);
    bool IsDragging { get; }
}