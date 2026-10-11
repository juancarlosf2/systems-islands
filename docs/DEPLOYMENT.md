# Hosting Systems / Islands

Systems / Islands is a static browser game. It requires no backend, database, account, environment variables, secrets, remote API or CDN. The repository and release downloads are at [juancarlosf2/systems-islands](https://github.com/juancarlosf2/systems-islands); hosting is a separate step you perform with your chosen provider.

## Build the conventional site

Use the Node requirements in the [README](../README.md#build-locally), then run from the repository root:

```sh
npm ci
npm run build
```

Publish the **contents of `dist/` as the web root**. Its `index.html`, `assets/`, `models/` and other generated files must keep their relative paths. Upload the complete output, including `THIRD_PARTY_NOTICES.txt`. For a local check:

```sh
npm run preview
```

The [v1.0.1 static ZIP](https://github.com/juancarlosf2/systems-islands/releases/download/v1.0.1/systems-islands-static.zip) is the prebuilt alternative. Extract it and publish the directory containing `index.html`; do not assume your host can run a ZIP as a page.

If your host builds from Git, use `npm ci && npm run build` as its build command and `dist` as its publish directory. Select a compatible Node version explicitly if the host's default differs from the README requirements.

## Root paths and subdirectories

Vite uses `base: './'`, and models load relative to the page. The output can live at a domain root or under a directory such as `/systems-islands/`. Keep all generated files together and access the directory URL with a trailing slash or its `index.html` directly. Game navigation stays inside the page; there is no server route or API to configure.

The host must serve HTML, JavaScript, CSS, fonts and GLB models as static files without replacing missing asset responses with another page. If a hosting product, including Sites, accepts supplied static files or a ZIP, follow its documented import procedure. This project does not provide a Sites integration or establish that any specific product supports those uploads. Choose a host that accepts the actual output.

## Portable edition

For direct browser opening, download [systems-islands-offline.html](https://github.com/juancarlosf2/systems-islands/releases/download/v1.0.1/systems-islands-offline.html), or use the same file from your local `dist/` after building. Open that named file in a modern browser. It embeds React, Three.js, Motion, fonts, styles, all sixteen worlds and the crew, and can play without a server or internet connection. Keep the embedded dependency notices with the file.

The ordinary `dist/index.html` references other files and must be served over HTTP or HTTPS. Opening it from disk is not the portable workflow. Conventional hosting also does not install an offline cache or service worker; use the portable file when reliable disconnected play is required.

The embedded edition is larger than a conventional entry page. A host or attachment service may impose file-size limits or download HTML instead of rendering it. Its policy determines whether you can serve that file; the conventional output remains available for static hosting.

## Verify your upload

1. Open the hosted `index.html` and confirm the chart and sixteen islands load.
2. Enter a chapter, change a control, and run a trial. Check a landmark and the field guide.
3. Check the browser console and network panel for missing files or page errors, especially GLB and font requests.
4. Reload after earning stars and confirm local progress persists when storage is available. Test a narrow viewport and keyboard navigation.

No deployment to a public host is implied by the repository's local [validation evidence](VALIDATION.md).

## Browser and storage limits

WebGL support is required for 3D rendering. When unavailable, the game reports that limitation and retains its DOM chapter controls and field notes. Browser/GPU performance and memory vary; responsive desktop browser evidence does not establish physical-phone coverage.

Progress and preferences use localStorage when permitted. A new domain, browser profile or device has separate progress; clearing storage removes it. File-origin storage rules vary. Private browsing or blocked storage may prevent persistence, in which case the current session remains playable. There is no cloud save or device synchronization.

Sound starts only after interaction. Reduced motion follows both the operating system and the game setting. Displayed metrics are educational simulations, not service capacity estimates for a real deployment.
