export default function WOTDWidget({word, pinyin, definition}) {
    return (
        <div className="wotd-widget">
            <div className="pinyin" lang="zh-Hans">{pinyin}</div>
            <div className="wotd">{word}</div>
            <div className="definition">{definition}</div>
        </div>
    );
}
