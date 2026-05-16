// ============================================
// 后端接口 - 客户看不到这个文件
// ⚠️ 如需更换 API Key，只改下面这一行
// ============================================
const ARK_API_KEY = 'ark-8f9157d0-f52b-4c26-b443-ef459a264b26-f2d3b';
const MODEL = 'doubao-seedream-4-5-251128';
const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

export default async function handler(req, res) {
  // 跨域设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST请求' });

  try {
    const { prompt, imageBase64, quality } = req.body;
    if (!prompt) return res.status(400).json({ error: '缺少prompt参数' });

    // 画质设置
    const size = quality === 'pro' ? '2K' : '1K';

    // 构建请求体
    const requestBody = {
      model: MODEL,
      prompt: prompt,
      n: 1,
      size: size,
      response_format: 'url',
    };

    // 如果有参考图片，加入图生图
    if (imageBase64) {
      requestBody.image_urls = [imageBase64];
    }

    // 第一步：提交任务
    const submitResp = await fetch(`${ARK_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const submitData = await submitResp.json();

    if (!submitResp.ok) {
      const msg = submitData?.error?.message || submitData?.message || `提交失败(${submitResp.status})`;
      return res.status(submitResp.status).json({ error: msg });
    }

    // 如果直接同步返回了图片
    const directUrl = submitData?.data?.[0]?.url;
    if (directUrl) {
      return res.status(200).json({ imageUrl: directUrl });
    }

    // 异步任务模式：轮询等待
    const taskId = submitData?.id || submitData?.task_id;
    if (!taskId) {
      return res.status(500).json({ error: '未获取到任务ID，请重试' });
    }

    // 轮询最多40次，每2秒一次，最长80秒
    for (let i = 0; i < 40; i++) {
      await sleep(2000);

      const pollResp = await fetch(`${ARK_BASE}/images/generations/${taskId}`, {
        headers: { 'Authorization': `Bearer ${ARK_API_KEY}` },
      });

      const pollData = await pollResp.json();
      const status = pollData?.status;

      if (status === 'succeeded' || status === 'completed' || status === 'success') {
        const imageUrl = pollData?.data?.[0]?.url || pollData?.images?.[0]?.url;
        if (!imageUrl) return res.status(500).json({ error: '未返回图片URL，请重试' });
        return res.status(200).json({ imageUrl });
      }

      if (status === 'failed' || status === 'error' || status === 'canceled') {
        const errMsg = pollData?.error?.message || '生成失败，请重试';
        return res.status(500).json({ error: errMsg });
      }

      // pending / running 继续等待
    }

    return res.status(504).json({ error: '渲染超时，请重试' });

  } catch (err) {
    console.error('接口错误:', err);
    return res.status(500).json({ error: err.message || '服务器错误，请重试' });
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
