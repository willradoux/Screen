import { jsx as _jsx } from "react/jsx-runtime";
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
/** QR code de um endereço (para abrir a sala no celular). Gerado no navegador, sem serviço externo. */
export function QrCode({ value, size = 200 }) {
    const [svg, setSvg] = useState(null);
    useEffect(() => {
        let alive = true;
        void QRCode.toString(value, { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M' })
            .then((s) => alive && setSvg(s))
            .catch(() => alive && setSvg(null));
        return () => {
            alive = false;
        };
    }, [value, size]);
    if (!svg)
        return null;
    // O SVG vem da biblioteca a partir do nosso próprio texto (a URL da sala), não de entrada de terceiros.
    return (_jsx("div", { role: "img", "aria-label": "QR code para abrir esta sala no celular", className: "inline-block rounded-2xl bg-white p-2 [&>svg]:block", dangerouslySetInnerHTML: { __html: svg } }));
}
