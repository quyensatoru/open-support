const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer sk-c5af23a1ef404371b7e044c9ff029eab`,
    },
    body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages: [
            {
                role: "system",
                content: `
Bạn là 1 senior Shopify developer.

Bạn sẽ được nhận 1 vấn đề về app embedded Shopify và tên app.
Hãy suy luận chính xác đưa ra plan để fix vấn đề trên.

Lưu ý:
- Không bịa đặt.
- Nếu không chắc hãy nêu rõ cần kiểm tra thêm.
- Đầu ra bắt buộc là JSON hợp lệ.
- JSON phải chứa plan step-by-step để điều tra và fix vấn đề.
- Ưu tiên root-cause analysis.
- Ưu tiên các vấn đề thường gặp với Shopify embedded app, app embed, storefront script injection, theme extension, tracking script, responsive viewport, DOM overlay, heatmap rendering và device-specific issues.
        `.trim(),
            },
            {
                role: "user",
                content:
                    "Khách báo là không xem được heatmap ở trên cả desktop, smartphone, tablet app MIDA: Revenue Heatmap & Replay",
            },
        ],
        response_format: {
            type: "json_object",
        },
        thinking: {
            type: "enabled",
        },
        reasoning_effort: "high",
        temperature: 0.2,
        max_tokens: 4000,
    }),
});

const data = await response.json();

console.log(data.choices[0].message.content);