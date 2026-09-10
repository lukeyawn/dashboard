export default function WOTDWidget({word, pinyin, definition}) {
    return (
        <div class="wotd-widget">
            <div class="pinyin">{pinyin}</div>
            <div class="wotd">{word}</div>
            <div class="definition">{definition}</div>
        </div>
    );
}