# Unsafe HTML

Both renderers must leave no script, no frame and no javascript: link; how they show the source may differ.

<script>alert(1)</script>

<iframe src="https://example.com"></iframe>

<a href="javascript:alert(1)">js link</a>

<img src="x" onerror="alert(1)">

<a href="https://example.com" onclick="alert(1)">handler</a>
