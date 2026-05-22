import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';
import Video, { OnBufferData, OnLoadData } from 'react-native-video';
import convertToProxyURL from 'react-native-video-cache-control';
import { Colors, Metrics } from '../../theme';
import ProgressiveImage from './ProgressiveImage';
import styles from './styles';
import { StoryViewProps, StroyTypes } from './types';

const StoryView = (props: StoryViewProps) => {
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);

  const source = props?.stories?.[props?.progressIndex];
  const videoRef = useRef<Video>(null);
  const videoData = useRef<OnLoadData | null>(null);
  const isLoaded = useRef(false);
  const isReady = useRef(false);
  const hasMounted = useRef(false);

  const isCurrentIndex = props?.index === props?.storyIndex;

  // ✅ Skip seek on first mount — causes crash on Android before video loads
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (props?.index === props?.storyIndex) {
      videoRef?.current?.seek(0);
    }
  }, [props?.storyIndex, props?.index]);

  // ✅ Safety fallback — if onLoad never fires (bad URL / network), unblock after 10s
  useEffect(() => {
    if (source?.type !== StroyTypes.Image && isCurrentIndex) {
      const timer = setTimeout(() => {
        setLoading(false);
        setBuffering(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isCurrentIndex, source?.type]);

  const onLoadStart = () => {
    setLoading(true);
    setBuffering(false);
    isLoaded.current = false;
    isReady.current = false;
    videoData.current = null;
  };

  // ✅ Both onLoad + onReadyForDisplay must complete before unblocking
  const tryStart = () => {
    if (!isCurrentIndex) return;
    if (isLoaded.current && isReady.current) {
      setLoading(false);
      setBuffering(false);
      if (videoData.current) {
        props?.onVideoLoaded?.(videoData.current);
      }
    }
  };

  // ✅ Detect HLS stream — .m3u8 must NEVER go through convertToProxyURL
  // convertToProxyURL only supports single-file MP4/media, not HLS playlists.
  // Wrapping .m3u8 through the local proxy returns a broken response → black screen.
  const isHLS =
    source?.url?.toLowerCase().includes('.m3u8') ||
    source?.url?.toLowerCase().includes('playlist');

  const videoSource = isHLS
    ? { uri: source?.url! }                          // HLS: direct URL, no proxy
    : { uri: convertToProxyURL({ url: source?.url! }) }; // MP4: use cache proxy

  const { height, width } = useWindowDimensions();

  return (
    <View style={[styles.divStory, { height, width }]} ref={props?.viewRef}>
      {source?.type === StroyTypes.Image ? (
        <ProgressiveImage
          viewStyle={props?.imageStyle ?? styles.imgStyle}
          imgSource={{ uri: source.url ?? '' }}
          thumbnailSource={{ uri: source.url ?? '' }}
          onImageLoaded={props.onImageLoaded}
        />
      ) : (
        isCurrentIndex && (
          <>
            <Video
              ref={videoRef}
              resizeMode="contain"
              paused={props.pause || loading}
              source={videoSource}
              onEnd={props?.onVideoEnd}
              onError={(_error: any) => {
                setLoading(false);
                setBuffering(false);
              }}
              onProgress={data => {
                if (isCurrentIndex) {
                  props?.onVideoProgress?.(data);
                }
              }}
              // ✅ Sensible buffer values — old BUFFER_TIME was 60,000ms (1 min!)
              // That forced the player to buffer 60s before it would start playing.
              bufferConfig={{
                minBufferMs: 2000,
                maxBufferMs: 5000,
                bufferForPlaybackMs: 1000,
                bufferForPlaybackAfterRebufferMs: 2000,
              }}
              onBuffer={(data: OnBufferData) => setBuffering(data.isBuffering)}
              onLoadStart={onLoadStart}
              onLoad={(item: OnLoadData) => {
                videoData.current = item;
                isLoaded.current = true;
                // Android never fires onReadyForDisplay — mark ready here
                if (!Metrics.isIOS) {
                  isReady.current = true;
                }
                tryStart();
              }}
              // ✅ iOS needs onReadyForDisplay — old code had null-check bug
              // videoData.current was initialized to `null` but checked `=== undefined`
              // so the guard never worked and loadVideo() bailed silently on iOS
              onReadyForDisplay={() => {
                isReady.current = true;
                tryStart();
              }}
              style={styles.contentVideoView}
              {...props?.videoProps}
            />
            {(loading || buffering) && props?.showSourceIndicator && (
              <ActivityIndicator
                animating
                pointerEvents="none"
                color={Colors.loaderColor}
                size="small"
                style={styles.loaderView}
                {...props?.sourceIndicatorProps}
              />
            )}
          </>
        )
      )}
    </View>
  );
};

export default StoryView;
