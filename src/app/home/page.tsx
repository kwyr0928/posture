"use client";

import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
  HandLandmarker,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

const POSECOLORS: { points: [number, number]; color: string }[] = [
  // 色の設定
  { points: [11, 12], color: "#FFD93D" }, // 胴体
  { points: [12, 24], color: "#FFD93D" },
  { points: [11, 23], color: "#FFD93D" },
  { points: [23, 24], color: "#FFD93D" },
  { points: [12, 14], color: "#FF6B6B" }, // 右腕
  { points: [14, 16], color: "#FF6B6B" },
  { points: [11, 13], color: "#6BCB77" }, // 左腕
  { points: [13, 15], color: "#6BCB77" },
  { points: [24, 26], color: "#4D96FF" }, // 右脚
  { points: [26, 28], color: "#4D96FF" },
  { points: [23, 25], color: "#845EC2" }, // 左脚
  { points: [25, 27], color: "#845EC2" },
];

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null); // カメラ
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // 骨格描画
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null); // 顔のランドマーク検出
  const handLandmarkerRef = useRef<HandLandmarker | null>(null); // 手のランドマーク検出
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null); // 姿勢ランドマーク検出
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null); // ジェスチャー認識
  let landmarks11: NormalizedLandmark | null = null;
  let landmarks12: NormalizedLandmark | null = null;
  const [isCameraOn, setIsCameraOn] = useState(false);
  let lastVideoTime = -1; // 経過時間
  let hasSent = false;
  let hasSent2 = false;
  let leftShoulder: NormalizedLandmark | null = null;
  let rightShoulder: NormalizedLandmark | null = null;
  const text1 = "開始ボタンを押してください";
  const text2 = "カメラ起動中";
  const [loading, setLoading] = useState(false);

  async function maybeSend() {
      await fetch('http://127.0.0.1:1880/msg', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state: 'good' })
});
      hasSent = true;
}

  async function maybeSend2() {
      await fetch('http://127.0.0.1:1880/msg', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state: 'bad' })
});
      hasSent2 = true;
}

useEffect(() => {
  if (!isCameraOn && canvasRef.current) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
}, [isCameraOn]);
  
  useEffect(() => {
    const createLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        // ファイルセット作成
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );
      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        // 顔のランドマーク検出を実行
        baseOptions: {
          modelAssetPath: `/face_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        // 手のランドマーク検出を実行
        baseOptions: {
          modelAssetPath: `/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2, // 両手
      });
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        // 姿勢ランドマーク検出を実行
        baseOptions: {
          modelAssetPath: "/pose_landmarker_full.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      const gestureRecognizer = await GestureRecognizer.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: "/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        }
      );

      faceLandmarkerRef.current = faceLandmarker; // 参照更新
      handLandmarkerRef.current = handLandmarker;
      poseLandmarkerRef.current = poseLandmarker;
      gestureRecognizerRef.current = gestureRecognizer;
    };
    createLandmarker();
  });

  const startCamera = async () => {
    setLoading(true);
    // カメラ起動
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play();
      setIsCameraOn(true);
      setLoading(false);
      renderLoop();
    }
  };

  const stopCamera = async () => {
    await fetch('http://127.0.0.1:1880/msg', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state: 'no' })
});
    const video = videoRef.current;
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    leftShoulder = null;
    rightShoulder = null;
    setIsCameraOn(false);
  };

   const  shoulderReset  = () => {
    leftShoulder = landmarks11;
    rightShoulder = landmarks12;
    renderLoop();
  };

  const renderLoop = () => {
    /// 描画更新
    const video = videoRef.current; // カメラ参照
    const canvas = canvasRef.current; // 描画参照
    const faceLandmarker = faceLandmarkerRef.current; // 顔 参照
    const handLandmarker = handLandmarkerRef.current; // 手 参照
    const poseLandmarker = poseLandmarkerRef.current; // 姿勢 参照
    const gestureRecognizer = gestureRecognizerRef.current; // 姿勢 参照
    if (!videoRef.current || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
  return; // 推論スキップ
}
    if (
      video &&
      canvas &&
      poseLandmarker &&
      handLandmarker &&
      faceLandmarker &&
      gestureRecognizer
    ) {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime; // 時間更新
        const faceResult = faceLandmarker.detectForVideo(
          // 顔 結果取得
          video,
          performance.now()
        );
        // const handResult = handLandmarker.detectForVideo(
        //   // 手 結果取得
        //   video,
        //   performance.now()
        // );
        const poseResult = poseLandmarker.detectForVideo(
          // 姿勢 結果取得
          video,
          performance.now()
        );
        // const gestureResult = gestureRecognizer.recognizeForVideo(
        //   // ジェスチャー 結果取得
        //   video,
        //   performance.now()
        // );

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const drawingUtils = new DrawingUtils(ctx); // 初期化

          if (faceResult.faceLandmarks) {
            const landmarks = faceResult.faceLandmarks[0];
            const noseTip = landmarks[1];
            const maskImage = new Image();
            maskImage.src = '/bird.png';
            const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x) * canvas.width;
    const maskSize = faceWidth * 0;
            const x = noseTip.x * canvas.width - maskSize / 2;
            const y = noseTip.y * canvas.height - maskSize / 2;
            ctx.drawImage(maskImage, x, y, maskSize, maskSize);
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            //   { color: "#C0C0C070", lineWidth: 1 }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
            //   { color: "#2600ff" }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
            //   { color: "#2600ff" }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
            //   { color: "#c8ff00" }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
            //   { color: "#c8ff00" }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
            //   { color: "#f8f8f8" }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_LIPS,
            //   { color: "#ff0000" }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
            //   { color: "#a1a1a1" }
            // );
            // drawingUtils.drawConnectors(
            //   landmarks,
            //   FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
            //   { color: "#a1a1a1" }
            // );
          }

          // if (handResult.landmarks) {
          //   // 手 描画
          //   const landmarks1 = handResult.landmarks[0];
          //   const landmarks2 = handResult.landmarks[1];
          //   drawingUtils.drawLandmarks(landmarks1, {
          //     color: "#6a89f0",
          //     radius: 3,
          //   });

          //   drawingUtils.drawConnectors(
          //     landmarks1,
          //     HandLandmarker.HAND_CONNECTIONS,
          //     {
          //       color: "#6a89f0",
          //       lineWidth: 3,
          //     }
          //   );
          //   drawingUtils.drawLandmarks(landmarks2, {
          //     color: "#6a89f0",
          //     radius: 3,
          //   });

          //   drawingUtils.drawConnectors(
          //     landmarks2,
          //     HandLandmarker.HAND_CONNECTIONS,
          //     {
          //       color: "#6a89f0",
          //       lineWidth: 3,
          //     }
          //   );
          // }

          if (poseResult.landmarks) {
            // 姿勢 描画
            const landmarks = poseResult.landmarks[0];
            landmarks11 = landmarks[11];
            landmarks12 = landmarks[12];

            if(leftShoulder == null || rightShoulder == null){
            leftShoulder = landmarks[11];
            rightShoulder = landmarks[12];
            console.log(landmarks[11]);
            console.log(landmarks[12]);
            } else if(leftShoulder.y > landmarks[11].y + 0.02) {
    if (!hasSent2) {
                  maybeSend2();
                  hasSent2 = true;
                }}
                else {
                  if (!hasSent) {
                  maybeSend();
                  hasSent = true;
                }
                hasSent = false;
                hasSent2 = false;
                }
                const cm = Math.round((leftShoulder.y - landmarks[11].y) * 1000);
                const text = `肩　${cm / 10}cm上昇`;
                const x = landmarks[11].x * canvas.width;
                const y = landmarks[11].y * canvas.height;
                ctx.font = "20px Arial";
                ctx.fillStyle = "white";
                ctx.fillText(text, x + 10, y);
  
  
            for (const { points, color } of POSECOLORS) {
              const [startIdx, endIdx] = points;
              const connector: NormalizedLandmark[] = [
                landmarks[startIdx],
                landmarks[endIdx],
              ];


              drawingUtils.drawLandmarks(connector, {
                color: color,
                radius: 3,
              });

              drawingUtils.drawConnectors(
                connector,
                PoseLandmarker.POSE_CONNECTIONS,
                {
                  color: color,
                  lineWidth: 3,
                }
              );
            }
          }

          // if (gestureResult.gestures) {
          //   // ジェスチャー 描画
          //     for (let i = 0; i < gestureResult.gestures.length; i++) {
          //       const gesture = gestureResult.gestures[i][0];
          //       const handLandmark = gestureResult.landmarks[i][0];

          //       if (gesture && handLandmark) {
          //         // const { categoryName, score } = gesture;
          //         // const confidence = Math.round(score * 100);
          //         // const text = `${categoryName} (${confidence}%)`;
          //         // const x = handLandmark.x * canvas.width;
          //         // const y = handLandmark.y * canvas.height;
          //         ctx.font = "20px Arial";
          //         ctx.fillStyle = "white";
          //         // ctx.fillText(text, x + 10, y);
  
          //     }
          //   }
          // }
        }
      }
      requestAnimationFrame(renderLoop);
    }
  };

  return (
    <div className="m-4">
      <h1 className="text-2xl font-bold my-4">MediaPipe 姿勢推定</h1>
      <div className="relative w-[640px] h-[480px]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          width={640}
          height={480}
          className="absolute top-0 left-0 z-10"
        />
  <canvas
    ref={canvasRef}
    width={640}
    height={480}
    className="absolute top-0 left-0 z-20"
  />
  {loading && (
      <div className="absolute top-0 left-0 w-[640px] h-[480px] bg-gray-300 z-0 flex items-center justify-center">
    <p className="text-2xl font-bold text-white p-4 rounded flex justify-center">
        {Array.from(text2).map((char, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              animation: "bounceY 1s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          >
            {char}
          </span>
        ))}
      </p>

      <style jsx>{`
        @keyframes bounceY {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
      `}</style>
  </div>
  )}
   {!isCameraOn && !loading && (
      <div className="absolute top-0 left-0 w-[640px] h-[480px] bg-gray-300 z-0 flex items-center justify-center">
    <p className="text-2xl font-bold text-white p-4 rounded flex justify-center">
        {text1}
      </p>
  </div>
  )}
      </div>
      <button
  onClick={isCameraOn ? stopCamera : startCamera}
  disabled={loading}
  className={`
    mt-4 px-4 py-2 rounded
    ${loading
      ? "bg-gray-400 text-gray-700 cursor-not-allowed"
      : isCameraOn
        ? "bg-red-500 text-white hover:bg-red-600"
        : "bg-blue-500 text-white hover:bg-blue-600"
    }
  `}
>
  {isCameraOn ? "終了" : "開始"}
</button>
      {isCameraOn &&
        <button
        onClick={shoulderReset}
        className={`
        mt-4 px-4 py-2 mx-4 rounded
    ${loading
      ? "bg-gray-400 text-gray-700 cursor-not-allowed"
      : "bg-blue-500 text-white hover:bg-blue-600"
    }
  `}
      >
        肩の位置をリセット
      </button>
       }
    </div>
  );
}
