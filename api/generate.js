// ============================================
// 后端接口 - 客户看不到这个文件
// 如果需要更换 API Key，只改这一行：
// ============================================
const ARK_API_KEY = 'ark-8f9157d0-f52b-4c26-b443-ef459a264b26-f2d3b';
const MODEL = 'doubao-seedream-4-5-251128';
const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const { prompt, imageBase64, strength, quality } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: '缺少 prompt 参数' });
    }

    // 构建请求体
    const requestBody = {
      model: MODEL,
      prompt: prompt,
      n: 1,
      response_format: 'url',
      size: quality === 'pro' ? '2K' : quality === 'user' ? '1K' : '1K',
    };

    // 如果有参考图片（图生图模式）
    if (imageBase64) {
      requestBody.image_urls = [imageBase64];
    }

    const response = await fetch(ARK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || `请求失败 (${response.status})`;
      return res.status(response.status).json({ error: errMsg });
    }

    // 轮询任务状态（火山引擎是异步的）
    if (data.status === 'pending' || data.status === 'running') {
      const taskId = data.id;
      const result = await pollTask(taskId);
      return res.status(200).json({ imageUrl: result });
    }

    // 同步返回
    const imageUrl = data?.data?.[0]?.url || data?.images?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: '未返回图片，请重试' });
    }

    return res.status(200).json({ imageUrl });

  } catch (err) {
    console.error('生成失败:', err);
    return res.status(500).json({ error: err.message || '服务器错误，请重试' });
  }
}

// 轮询任务直到完成
async function pollTask(taskId, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    await sleep(2000);
    const resp = await fetch(`${ARK_ENDPOINT}/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${ARK_API_KEY}` }
    });
    const data = await resp.json();
    if (data.status === 'succeeded' || data.status === 'completed') {
      return data?.data?.[0]?.url || data?.images?.[0]?.url;
    }
    if (data.status === 'failed') {
      throw new Error(data.error?.message || '任务失败');
    }
  }
  throw new Error('渲染超时，请重试');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
