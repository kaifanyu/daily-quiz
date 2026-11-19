# Corkboard

Open **Corkboard** in the main navigation, or visit `/corkboard`.

- Place sticky notes, paper links, and PNG/JPEG/WebP images.
- Drag cards; double-click or press Enter on a focused card to edit. Selected cards have a resize handle; focus the handle and use arrow keys to resize with the keyboard.
- Click two red pins, or drag between pins, to connect cards. Select a thread to delete it.
- Drag the background to pan, scroll to zoom, or use the zoom controls. Hold Space to pan over cards. `1` fits all cards.
- `V`: select; `H`, then arrow keys: pan the canvas; `N`, then `Enter`: place a note at the center; `C`: thread. Arrow keys move a focused card, with Shift for larger movement or panning steps. Focus a pin and press Enter, then focus another pin and press Enter to connect them.
- Undo/redo covers content, movement, resizing, deletion, and imports. Deleting a card also removes its threads.
- Board content and viewport are saved in IndexedDB on the current browser and origin. No Supabase migration or new service is needed. This first version does not sync devices or support live collaboration.
- Export downloads a JSON backup including images, card positions and sizes, red threads, and the viewport. Import validates a backup and restores it exactly; Undo restores the prior board. Use Fit if you import onto a differently sized screen. Invalid files leave the current board unchanged. Browser data clearing removes the local board, so keep exports for backups.

## Design scope

The cork material, paper colors, red threads, and handwritten notes are specific to this route. Controls and paper links retain the app's typography; the shared navigation keeps its Labbook identity. The board fills the space below the navigation and remains light in either app theme. On phones, the editor opens as a bottom sheet and the zoom controls sit above the creation toolbar. The existing global design files are preserved.

## Reference assets

At the user's request, the cork texture and red pin artwork were sourced from the supplied reference, https://board.atrioc.biz/, on 2026-11-19. The application logic is implemented in Svelte; the tldraw SDK is not bundled.

| Local asset                 | Reference URL                                           |
| --------------------------- | ------------------------------------------------------- |
| `static/corkboard/cork.png` | https://board.atrioc.biz/assets/cork-C0z_tLWT.png       |
| `static/corkboard/pin.png`  | https://board.atrioc.biz/assets/pin-placed-ZOioYaNS.png |

Source provenance is also embedded in each shipping PNG. The reference does not expose licensing information for these two assets. Preserve their recorded source when distributing them.
