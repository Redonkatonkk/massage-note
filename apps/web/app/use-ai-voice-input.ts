"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiBase, errorMessage } from "../lib/api";
import type { AppLocale } from "../lib/i18n";

const recordingMimeTypes = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "video/mp4",
] as const;
const minimumRecordingMs = 6_500;

function supportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return recordingMimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

export function useAiVoiceInput({
  storeId,
  locale,
  enabled,
  onText,
  onError,
}: {
  storeId?: string | undefined;
  locale: AppLocale;
  enabled: boolean;
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [finishingRecording, setFinishingRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minimumStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartedAtRef = useRef(0);
  const discardRef = useRef(false);
  const enabledRef = useRef(enabled);
  const storeIdRef = useRef(storeId);
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  const mountedRef = useRef(true);

  enabledRef.current = enabled;
  storeIdRef.current = storeId;
  onTextRef.current = onText;
  onErrorRef.current = onError;

  function clearRecordingResources() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (minimumStopTimerRef.current) clearTimeout(minimumStopTimerRef.current);
    minimumStopTimerRef.current = null;
    recordingStartedAtRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (mountedRef.current) {
      setRecording(false);
      setFinishingRecording(false);
    }
  }

  function cancelRecording() {
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else clearRecordingResources();
  }

  useEffect(() => {
    cancelRecording();
  }, [enabled, storeId]);

  useEffect(() => () => {
    mountedRef.current = false;
    discardRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (minimumStopTimerRef.current) clearTimeout(minimumStopTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder) recorder.onstop = null;
    if (recorder?.state === "recording") recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function transcribe(blob: Blob) {
    if (!storeId || discardRef.current) return;
    if (mountedRef.current) setTranscribing(true);
    try {
      const response = await fetch(`${apiBase}/stores/${storeId}/ai/work/transcribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": blob.type.split(";", 1)[0] || "audio/mp4", "Accept-Language": locale },
        body: blob,
      });
      const payload = await response.json().catch(() => null) as { text?: string; messageZh?: string; code?: string } | null;
      if (!response.ok) throw new ApiError(response.status, payload);
      if (!payload?.text?.trim()) throw new Error("语音识别失败");
      if (!discardRef.current) onTextRef.current(payload.text.trim());
    } catch (caught) {
      if (!discardRef.current) onErrorRef.current(errorMessage(caught));
    } finally {
      if (mountedRef.current) setTranscribing(false);
    }
  }

  async function startRecording() {
    if (!enabled || !storeId || recording || transcribing) return;
    onErrorRef.current("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onErrorRef.current("当前浏览器不支持录音，请使用文字输入或手机键盘听写");
      return;
    }
    const mimeType = supportedMimeType();
    if (!mimeType) {
      onErrorRef.current("当前浏览器不能生成 MiniMax 可识别的 MP4 录音，请使用文字输入或手机键盘听写");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      if (!mountedRef.current || !enabledRef.current || storeIdRef.current !== storeId) {
        clearRecordingResources();
        return;
      }
      const chunks: BlobPart[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      } catch {
        recorder = new MediaRecorder(stream, { mimeType });
      }
      discardRef.current = false;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        const shouldDiscard = discardRef.current;
        clearRecordingResources();
        if (!shouldDiscard) void transcribe(new Blob(chunks, { type: mimeType }));
      };
      recorder.start(500);
      recordingStartedAtRef.current = Date.now();
      setRecording(true);
      timerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 60_000);
    } catch (caught) {
      clearRecordingResources();
      if (!mountedRef.current) return;
      onErrorRef.current(caught instanceof DOMException && caught.name === "NotAllowedError"
        ? "没有获得麦克风权限，请在浏览器设置中允许后重试"
        : errorMessage(caught));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    const remaining = minimumRecordingMs - (Date.now() - recordingStartedAtRef.current);
    if (remaining > 0) {
      setFinishingRecording(true);
      if (!minimumStopTimerRef.current) {
        minimumStopTimerRef.current = setTimeout(() => {
          minimumStopTimerRef.current = null;
          if (recorder.state === "recording") recorder.stop();
        }, remaining);
      }
      return;
    }
    recorder.stop();
  }

  return { recording, finishingRecording, transcribing, startRecording, stopRecording, cancelRecording };
}
