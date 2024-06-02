import { Button, Text } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { EtaPredictionJson } from "../../models/etaJson.js";
import {
  LineStopEta,
  stopBookmarkWithEta,
  stopBookmarksRedux,
} from "../../models/etaObjects.js";
import { store, useAppSelector } from "../../store/index.js";
import { settingsSelectors } from "../../store/settings/slice.js";
import { subwayDbSelectors } from "../../store/suwbayDb/slice.js";
import Bookmark from "../bookmarks/Bookmark.js";
import { EtaCard } from "../etaCard/EtaCard.js";
import { getTTCMultiRouteData } from "../fetch/fetchUtils.js";
import {
  multiStopParser,
  multiStopUnifier,
} from "../parser/multiStopParser.js";
import RawDisplay from "../rawDisplay/RawDisplay.js";
import { BookmarkCardEta } from "./BookmarkCardEta.js";
import style from "./FavouriteEta.module.css";

export default function FavouriteEta() {
  const stopBookmarks = useAppSelector(
    (state: { stopBookmarks: stopBookmarksRedux }) => state.stopBookmarks
  );

  const subwayBookmarks = useAppSelector(
    (state: { stopBookmarks: stopBookmarksRedux }) =>
      Object.values(state.stopBookmarks.entities).filter((item) => {
        return item.type === "ttc-subway" && (item.enabled?.length ?? 0) > 0;
      })
  );
  const { t } = useTranslation();
  const [data, setData] = useState<EtaPredictionJson>();
  const [singleEtaDb, setSingleEtaDb] = useState<LineStopEta[]>([]);
  const [unifiedEtaDb, setUnifiedEtaDb] = useState<stopBookmarkWithEta[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(0);
  const unifiedEtaValue =
    settingsSelectors.selectById(store.getState().settings, "unifiedEta")
      ?.value !== "false";

  let fetchUrl = "";

  for (const id of stopBookmarks.ids) {
    const ttcStop = stopBookmarks.entities[id].ttcId;

    const lines = stopBookmarks.entities[id].enabled
      ? stopBookmarks.entities[id].enabled
      : stopBookmarks.entities[id].lines;

    if (lines && lines.length > 0)
      for (const line of lines) {
        if (parseInt(line) > 6)
          fetchUrl = fetchUrl.concat(`&stops=${parseInt(line)}|${ttcStop}`);
      }
  }

  const setEtaDb = (data?: EtaPredictionJson) => {
    if (unifiedEtaValue) {
      if (data) {
        setUnifiedEtaDb(multiStopUnifier(data, stopBookmarks));
      } else
        setUnifiedEtaDb(
          subwayBookmarks.map((subwayStop) => {
            return { ...subwayStop, etas: [] };
          })
        );
    } else {
      setSingleEtaDb(
        (data ? multiStopParser(data) : []).concat(
          subwayBookmarks.map((subwayStop) => {
            return {
              line: subwayStop.lines[0],
              stopName: subwayStop.name,
              routeName: subwayStop.name,
              etas: [],
              stopTag: subwayStop.stopId,
              type: subwayStop.type,
            };
          })
        )
      );
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (fetchUrl.length > 0) {
      getTTCMultiRouteData(controller, fetchUrl).then(
        ({ parsedData, error }) => {
          if (error || !parsedData) {
            return;
          }
          setData(parsedData);
          setLastUpdatedAt(Date.now());
          setEtaDb(parsedData);
        }
      );
    } else {
      setEtaDb();
    }

    // when useEffect is called, the following clean-up fn will run first
    return () => {
      controller.abort();
    };
  }, []);

  const EtaCards = [];
  if (unifiedEtaValue) {
    for (const item of unifiedEtaDb) {
      if (
        item.etas.length > 0 ||
        (item.type === "ttc-subway" && item.enabled?.length)
      ) {
        const id = item.stopId;

        const name =
          item.type === "ttc-subway" && id
            ? subwayDbSelectors.selectById(store.getState().subwayDb, id)?.stop
                ?.name ?? item.name
            : item.name;

        EtaCards.push(
          <EtaCard
            enabled={item.enabled}
            key={id}
            id={id.toString()}
            etas={item.etas}
            lines={item.enabled ? item.enabled : item.lines}
            name={name}
            editable={false}
            onDelete={undefined}
            stopUrl={
              item.type === "ttc-subway"
                ? `/ttc/lines/${item.lines[0]}/${item.stopId}`
                : `/stops/${id}`
            }
          />
        );
      }
    }
  } else {
    for (const item of singleEtaDb) {
      if (item.etas.length > 0 || item.type === "ttc-subway") {
        const id = `${item.line}-${item.stopTag}`;
        EtaCards.push(<BookmarkCardEta item={item} key={id} />);
      }
    }
  }

  return (
    <article className={style["favorite-eta"]}>
      {stopBookmarks.ids.length === 0 ? (
        <section className={style["item-info-placeholder"]}>
          <Trans>{t("home.headline")}</Trans>
          <Text>{t("home.bookmarkReminder")}</Text>
        </section>
      ) : EtaCards.length > 0 ? (
        <>
          {navigator.onLine ? null : (
            <Text>Device seems to be offline. Results may be inaccurate.</Text>
          )}
          <ul>{EtaCards}</ul>
        </>
      ) : lastUpdatedAt > 0 || !navigator.onLine ? (
        <section>
          <p>
            {navigator.onLine
              ? t("home.homeNoEta")
              : "Your device seems to be offline."}
          </p>
          <Bookmark />
        </section>
      ) : null}
      <Link to={"/bookmarks"}>
        <Button>{t("buttons.bookmarkEdit")}</Button>
      </Link>

      {data !== undefined && <RawDisplay data={data} />}
    </article>
  );
}
